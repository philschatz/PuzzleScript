import { Cell, GameData, GameEngine, Optional } from '..'
import { RULE_DIRECTION } from '../index'
import { IColor } from '../models/colors'
import { GameSprite } from '../models/tile'
import Parser from '../parser/parser'
import { _flatten } from '../util'

class CellColorCache {
    private readonly cache: Map<string, IColor[][]>

    constructor() {
        this.cache = new Map()
    }

    public get(spritesToDrawSet: Set<GameSprite>,
               backgroundColor: Optional<IColor>,
               spriteHeight: number,
               spriteWidth: number) {
        const spritesToDraw = [...spritesToDrawSet]
        .sort((s1, s2) => s1.getCollisionLayer().id - s2.getCollisionLayer().id)
        .reverse()

        const key = spritesToDraw.map((s) => s.getName()).join(' ')
        let ret = this.cache.get(key)
        if (!ret) {
            ret = collapseSpritesToPixels(spritesToDraw, backgroundColor, spriteHeight, spriteWidth)
            this.cache.set(key, ret)
        }
        return ret
    }

    public clear() {
        this.cache.clear()
    }
}

// First Sprite one is on top.
// This caused a 2x speedup while rendering.
function collapseSpritesToPixels(spritesToDraw: GameSprite[],
                                 backgroundColor: Optional<IColor>,
                                 spriteHeight: number,
                                 spriteWidth: number) {

    if (spritesToDraw.length === 0) {
        // Just draw the background
        const spritePixels: IColor[][] = []
        for (let y = 0; y < spriteHeight; y++) {
            spritePixels[y] = spritePixels[y] || []
            for (let x = 0; x < spriteWidth; x++) {
                // If this is the last sprite and nothing was found then use the game background color
                if (backgroundColor) {
                    spritePixels[y][x] = backgroundColor
                }
            }
        }
        return spritePixels
    }
    // Record Code coverage
    if (process.env.NODE_ENV === 'development') {
        spritesToDraw[0].__incrementCoverage()
    }
    if (spritesToDraw.length === 1) {
        return spritesToDraw[0].getPixels(spriteHeight, spriteWidth)
    }
    const sprite = spritesToDraw[0].getPixels(spriteHeight, spriteWidth)
    spritesToDraw.slice(1).forEach((objectToDraw, spriteIndex) => {
        if (process.env.NODE_ENV === 'development') {
            objectToDraw.__incrementCoverage()
        }
        const pixels = objectToDraw.getPixels(spriteHeight, spriteWidth)
        for (let y = 0; y < spriteHeight; y++) {
            sprite[y] = sprite[y] || []
            for (let x = 0; x < spriteWidth; x++) {
                const pixel = pixels[y][x]
                // try to pull it out of the current sprite
                if ((!sprite[y][x] || sprite[y][x].isTransparent()) && pixel && !pixel.isTransparent()) {
                    sprite[y][x] = pixel
                }
            }
        }
    })
    return sprite
}

abstract class BaseUI {
    public PIXEL_WIDTH: number // number of characters in the terminal used to represent a pixel
    public PIXEL_HEIGHT: number
    protected gameData: Optional<GameData>
    protected engine: Optional<GameEngine>
    protected renderedPixels: Array<Array<{hex: string, chars: string}>> // string is the hex code of the pixel
    protected windowOffsetColStart: number
    protected windowOffsetRowStart: number
    protected windowOffsetWidth: Optional<number>
    protected windowOffsetHeight: Optional<number>
    protected isDumpingScreen: boolean
    protected SPRITE_WIDTH: number
    protected SPRITE_HEIGHT: number
    protected hasVisualUi: boolean
    private readonly cellColorCache: CellColorCache
    private lastTick: number

    constructor() {
        this.cellColorCache = new CellColorCache()
        this.renderedPixels = []
        this.windowOffsetColStart = 0
        this.windowOffsetRowStart = 0
        this.isDumpingScreen = false
        // defaults that get overridden later
        this.PIXEL_HEIGHT = 1
        this.PIXEL_WIDTH = 2
        this.SPRITE_HEIGHT = 5
        this.SPRITE_WIDTH = 5

        this.hasVisualUi = true
        this.lastTick = 0
    }

    public destroy() {
        this.gameData = null
        this.engine = null
        this.renderedPixels = []
        this.cellColorCache.clear()
    }
    public setGameEngine(engine: GameEngine) {
        this.engine = engine
        this.gameData = engine.getGameData()

        this.renderedPixels = []
        this.cellColorCache.clear()
        this.clearScreen()

        // reset flickscreen and zoomscreen settings
        this.windowOffsetColStart = 0
        this.windowOffsetRowStart = 0

        this.windowOffsetWidth = null
        this.windowOffsetHeight = null
        if (this.gameData.metadata.flickscreen) {
            const { width, height } = this.gameData.metadata.flickscreen
            this.windowOffsetWidth = width
            this.windowOffsetHeight = height
        } else if (this.gameData.metadata.zoomscreen) {
            const { width, height } = this.gameData.metadata.zoomscreen
            this.windowOffsetWidth = width
            this.windowOffsetHeight = height
        }

        // Set the sprite width/height based on the 1st sprite (default is 5x5)
        // TODO: Loop until we find an actual sprite, not a single-color sprite
        const { spriteHeight, spriteWidth } = this.gameData.getSpriteSize()
        this.SPRITE_HEIGHT = spriteHeight
        this.SPRITE_WIDTH = spriteWidth
    }

    public setGame(gameData: string) {
        const { data } = Parser.parse(gameData)
        if (!data) {
            throw new Error(`BUG: Could not parse gameData and did not find an error`)
        }
        this.setGameEngine(new GameEngine(data))
    }
    public getGameData() {
        if (!this.engine) {
            throw new Error(`BUG: Game has not been specified yet`)
        }
        return this.engine.getGameData()
    }

    public press(dir: RULE_DIRECTION) {
        if (this.engine) {
            this.engine.press(dir)
        }
    }
    public pressUp() {
        this.press(RULE_DIRECTION.UP)
    }
    public pressDown() {
        this.press(RULE_DIRECTION.DOWN)
    }
    public pressLeft() {
        this.press(RULE_DIRECTION.LEFT)
    }
    public pressRight() {
        this.press(RULE_DIRECTION.RIGHT)
    }
    public pressAction() {
        this.press(RULE_DIRECTION.ACTION)
    }
    public pressUndo() {
        if (this.engine) {
            this.engine.pressUndo(); this.renderScreen(false)
        }
    }
    public pressRestart() {
        if (this.engine) {
            this.engine.pressRestart(); this.renderScreen(false)
        }
    }
    public setLevel(levelNum: number) {
        if (this.engine) {
            this.engine.setLevel(levelNum)
        }
    }
    public getCurrentLevelCells() {
        if (this.engine) {
            return this.engine.getCurrentLevelCells()
        } else {
            throw new Error(`BUG: Game has not been specified yet`)
        }
    }
    public tick() {
        if (!this.engine) {
            throw new Error(`BUG: Game has not been specified yet`)
        }
        const now = Date.now()
        const gameData = this.getGameData()
        let minTime = Math.min(gameData.metadata.realtimeInterval || 1000, gameData.metadata.keyRepeatInterval || 1000, gameData.metadata.againInterval || 1000)
        if (minTime > 100 || Number.isNaN(minTime)) {
            minTime = .01
        }
        if ((now - this.lastTick) >= (minTime * 1000)) {
            this.lastTick = now
            const ret = this.engine.tick()
            this.drawCells(ret.changedCells, false)
            return ret
        } else {
            return {
                changedCells: new Set<Cell>(),
                soundToPlay: null,
                messageToShow: null,
                didWinGame: false,
                didLevelChange: false,
                wasAgainTick: false
            }
        }
    }

    public debugRenderScreen() {
        if (this.engine) {
            this.renderScreen(true)
        }
    }

    public renderMessageScreen(message: string) {
        const screenWidth = 34
        const screenHeight = 13
        // re-center the screen so we can show the message
        // remember these values so we can restore them right after rendering the message
        // tslint:disable-next-line:no-this-assignment
        const { windowOffsetColStart, windowOffsetRowStart, windowOffsetHeight, windowOffsetWidth } = this
        this.windowOffsetColStart = 0
        this.windowOffsetRowStart = 0
        this.windowOffsetHeight = screenHeight
        this.windowOffsetWidth = screenWidth
        this.clearScreen()

        if (this.engine) {
            const sprites = this.createMessageSprites(message)
            this.engine.setMessageLevel(sprites)
            // this.renderScreen(false)
            this.drawCellsAfterRecentering(_flatten(this.getCurrentLevelCells()), 0)
            this.engine.restoreFromMessageLevel()
        }

        this.windowOffsetColStart = windowOffsetColStart
        this.windowOffsetRowStart = windowOffsetRowStart
        this.windowOffsetHeight = windowOffsetHeight
        this.windowOffsetWidth = windowOffsetWidth
    }

    public renderScreen(clearCaches: boolean, renderScreenDepth: number = 0) {
        if (!this.gameData) {
            throw new Error(`BUG: gameData was not set yet`)
        }
        if (!this.engine) {
            throw new Error(`BUG: gameEngine was not set yet`)
        }

        const level = this.engine.getCurrentLevel()
        if (!level.isMap()) {
            this.renderMessageScreen(level.getMessage())
            return
        }

        // Otherwise, the level is a Map so render the cells
        const levelRows = this.engine.getCurrentLevelCells()

        if (clearCaches) {
            this.cellColorCache.clear()
            this.renderedPixels = []
        }

        this.renderLevelScreen(levelRows, renderScreenDepth)
    }

    public drawCells(cells: Iterable<Cell>, dontRestoreCursor: boolean, renderScreenDepth: number = 0) {
        if (!this.gameData) {
            throw new Error(`BUG: gameData was not set yet`)
        }
        if (!this.engine) {
            throw new Error(`BUG: gameEngine was not set yet`)
        }

        // Sort of HACKy... If the player is not visible on the screen then we need to
        // move the screen so that they are visible.
        const playerTile = this.gameData.getPlayer()
        if (playerTile.getCellsThatMatch().size === 1) {
            // if the screen can only show an even number of cells (eg 4) then this will oscillate indefinitely
            // So we limit the recursion to just a couple of recursions
            if (renderScreenDepth <= 1) {
                const playerCell = [...playerTile.getCellsThatMatch()][0]
                const { isOnScreen } = this.cellPosToXY(playerCell)
                if (this.recenterPlayerIfNeeded(playerCell, isOnScreen)) {
                    // if we moved the screen then re-render the whole screen
                    cells = _flatten(this.engine.getCurrentLevelCells())
                }
            }
            // otherwise, keep rendering cells like normal
        }

        if (!this.hasVisualUi) {
            return // no need to re-say the whole level (a11y)
        }
        this.drawCellsAfterRecentering(cells, renderScreenDepth)
    }

    protected createMessageTextScreen(messageStr: string) {
        const titleImage = [
            '                                  ',
            '                                  ',
            '                                  ',
            '                                  ',
            '                                  ',
            '                                  ',
            '                                  ',
            '                                  ',
            '                                  ',
            '                                  ',
            '          X to continue           ',
            '                                  ',
            '                                  '
        ]

        function wordwrap(str: string, screenWidth: number) {
            screenWidth = screenWidth || 75
            const cut = true
            if (!str) { return str }
            const regex = '.{1,' + screenWidth + '}(\\s|$)' + (cut ? '|.{' + screenWidth + '}|.+$' : '|\\S+?(\\s|$)')
            const ret = str.match(RegExp(regex, 'g'))
            if (ret) {
                return ret
            }
            throw new Error(`BUG: Match did not work`)
        }

        const emptyLineStr = titleImage[9]
        const xToContinueStr = titleImage[10]

        titleImage[10] = emptyLineStr

        const width = titleImage[0].length

        const splitMessage = wordwrap(messageStr, titleImage[0].length)

        let offset = 5 - ((splitMessage.length / 2) | 0) // tslint:disable-line:no-bitwise
        if (offset < 0) {
            offset = 0
        }

        const count = Math.min(splitMessage.length, 12)
        for (let i = 0; i < count; i++) {
            const m = splitMessage[i]
            const row = offset + i
            const messageLength = m.length
            const lmargin = ((width - messageLength) / 2) | 0 // tslint:disable-line:no-bitwise
            // var rmargin = width-messageLength-lmargin;
            const rowtext = titleImage[row]
            titleImage[row] = rowtext.slice(0,lmargin) + m + rowtext.slice(lmargin + m.length)
        }

        let endPos = 10
        if (count >= 10) {
            if (count < 12) {
                endPos = count + 1
            } else {
                endPos = 12
            }
        }
        // if (quittingMessageScreen) {
        //     titleImage[endPos]=emptyLineStr;
        // } else {
        titleImage[endPos] = xToContinueStr
        // }

        return titleImage
    }

    protected createMessageSprites(messageStr: string) {
        if (!this.gameData) {
            throw new Error(`BUG: gameData was not set yet`)
        }
        if (!this.engine) {
            throw new Error(`BUG: gameEngine was not set yet`)
        }
        const titleImage = this.createMessageTextScreen(messageStr)

        // Now, convert the string array into cells
        const cells: Array<Array<Set<GameSprite>>> = []
        for (const row of titleImage) {
            const cellsRow: Array<Set<GameSprite>> = []
            cells.push(cellsRow)
            for (const char of row) {
                const sprite = this.gameData.getLetterSprite(char)
                cellsRow.push(new Set([sprite]))
            }
        }
        return cells
    }

    protected abstract renderLevelScreen(levelRows: Cell[][], renderScreenDepth: number): void

    protected abstract setPixel(x: number, y: number, hex: string, fgHex: Optional<string>, chars: string): void

    protected abstract checkIfCellCanBeDrawnOnScreen(cellStartX: number, cellStartY: number): boolean

    protected cellPosToXY(cell: Cell) {
        const { colIndex, rowIndex } = cell
        let isOnScreen = true // can be set to false for many reasons
        let cellStartX = -1
        let cellStartY = -1
        if (this.windowOffsetHeight && this.windowOffsetWidth) {
            if (this.windowOffsetColStart > colIndex ||
                this.windowOffsetRowStart > rowIndex ||
                this.windowOffsetColStart + this.windowOffsetWidth <= colIndex ||
                this.windowOffsetRowStart + this.windowOffsetHeight <= rowIndex) {

                // cell is off-screen
                isOnScreen = false
            }
        }
        cellStartX = (colIndex - this.windowOffsetColStart) * this.SPRITE_WIDTH
        cellStartY = (rowIndex - this.windowOffsetRowStart) * this.SPRITE_HEIGHT /*pixels*/

        if (isOnScreen) {
            isOnScreen = this.checkIfCellCanBeDrawnOnScreen(cellStartX, cellStartY)
        }

        if (cellStartX < 0 || cellStartY < 0) {
            isOnScreen = false
        }
        return { isOnScreen, cellStartX, cellStartY }
    }

    protected abstract getMaxSize(): {columns: number, rows: number}

    protected abstract drawCellsAfterRecentering(cells: Iterable<Cell>, renderScreenDepth: number): void

    protected getPixelsForCell(cell: Cell) {
        if (!this.gameData) {
            throw new Error(`BUG: gameData was not set yet`)
        }
        const spritesToDrawSet = cell.getSpritesAsSet() // Not sure why, but entanglement renders properly when reversed

        // If there is a magic background object then rely on it last
        const magicBackgroundSprite = this.gameData.getMagicBackgroundSprite()
        if (magicBackgroundSprite) {
            spritesToDrawSet.add(magicBackgroundSprite)
        }

        const pixels = this.cellColorCache.get(spritesToDrawSet,
            this.gameData.metadata.backgroundColor, this.SPRITE_HEIGHT, this.SPRITE_WIDTH)
        return pixels
    }

    protected clearScreen() {
        this.renderedPixels = []
    }

    protected hasAgainThatNeedsToRun() {
        if (!this.engine) {
            throw new Error(`BUG: Engine has not been set yet`)
        }
        return this.engine.hasAgain()
    }

    // Returns true if the window was moved (so we can re-render the screen)
    private recenterPlayerIfNeeded(playerCell: Cell, isOnScreen: boolean) {
        if (!this.gameData) {
            throw new Error(`BUG: gameData was not set yet`)
        }
        if (!this.engine) {
            throw new Error(`BUG: gameEngine was not set yet`)
        }
        let boundingBoxLeft
        let boundingBoxTop
        let boundingBoxWidth
        let boundingBoxHeight

        const windowLeft = this.windowOffsetColStart
        const windowTop = this.windowOffsetRowStart
        let windowWidth
        let windowHeight

        const flickScreen = this.gameData.metadata.flickscreen
        const zoomScreen = this.gameData.metadata.zoomscreen
        // these are number of sprites that can fit on the terminal
        const { columns, rows } = this.getMaxSize()
        const terminalWidth = Math.floor(columns / this.SPRITE_WIDTH / this.PIXEL_WIDTH)
        const terminalHeight = Math.floor(rows / this.SPRITE_HEIGHT / this.PIXEL_HEIGHT)

        if (flickScreen) {
            boundingBoxTop = playerCell.rowIndex - (playerCell.rowIndex % flickScreen.height)
            boundingBoxLeft = playerCell.colIndex - (playerCell.colIndex % flickScreen.width)
            boundingBoxHeight = flickScreen.height
            boundingBoxWidth = flickScreen.width
        } else {
            boundingBoxLeft = 0
            boundingBoxTop = 0
            boundingBoxHeight = this.engine.getCurrentLevelCells().length
            boundingBoxWidth = this.engine.getCurrentLevelCells()[0].length
        }

        if (zoomScreen) {
            windowHeight = Math.min(zoomScreen.height, terminalHeight)
            windowWidth = Math.min(zoomScreen.width, terminalWidth)
        } else {
            windowHeight = terminalHeight
            windowWidth = terminalWidth
        }

        // If the boundingbox is larger than the window then we need to apply the zoom
        // which means we need to pan whenever the player moves out of the middle 1/2 of
        // the screen.
        if (boundingBoxHeight <= windowHeight && boundingBoxWidth <= windowWidth) {
            // just ensure that the player is on the screen
            if (!isOnScreen) {
                this.windowOffsetColStart = boundingBoxLeft
                this.windowOffsetRowStart = boundingBoxTop
                return true
            }
        } else {
            // Move the screen so that the player is centered*
            // Except when we are at one of the edges of the level/flickscreen

            // Check the left and then the top
            let didADirectionChange = false

            if (boundingBoxWidth > windowWidth) {
                if (windowLeft + Math.round(windowWidth / 4) > playerCell.colIndex ||
                    windowLeft + Math.round(windowWidth * 3 / 4) <= playerCell.colIndex) {

                    let newWindowLeft = playerCell.colIndex - Math.floor(windowWidth / 2)
                    // Check the near sides of the bounding box (left)
                    newWindowLeft = Math.max(newWindowLeft, boundingBoxLeft)
                    // Check the far sides of the bounding box (right)
                    if (newWindowLeft + windowWidth > boundingBoxLeft + boundingBoxWidth) {
                        newWindowLeft = boundingBoxLeft + boundingBoxWidth - windowWidth
                    }

                    if (newWindowLeft !== this.windowOffsetColStart) {
                        this.windowOffsetColStart = newWindowLeft
                        didADirectionChange = true
                    }
                }
            }

            // This is copy/pasta'd from above but adjusted for Top instead of Left
            if (boundingBoxHeight > windowHeight) {
                if (windowTop + Math.round(windowHeight / 4) > playerCell.rowIndex ||
                    windowTop + Math.round(windowHeight * 3 / 4) <= playerCell.rowIndex) {

                    let newWindowTop = playerCell.rowIndex - Math.floor(windowHeight / 2)

                    // Check the near sides of the bounding box (top)
                    newWindowTop = Math.max(newWindowTop, boundingBoxTop)

                    // Check the far sides of the bounding box (bottom)
                    if (newWindowTop + windowHeight > boundingBoxTop + boundingBoxHeight) {
                        newWindowTop = boundingBoxTop + boundingBoxHeight - windowHeight
                    }

                    // Only recenter the axis that moved to be out-of-center
                    // Use Math.abs() because an even number of cells visible
                    // (e.g. 4) will cause the screen to clicker back and forth
                    if (newWindowTop !== this.windowOffsetRowStart) {
                        this.windowOffsetRowStart = newWindowTop
                        didADirectionChange = true
                    }
                }
            }

            if (!didADirectionChange) {
                // cell is within the middle of the window.
                // just ensure that the player is on the screen
                if (!isOnScreen) {
                    this.windowOffsetColStart = boundingBoxLeft
                    this.windowOffsetRowStart = boundingBoxTop
                    return true
                }

            }
            return didADirectionChange
        }

        return false
    }

}

export default BaseUI
