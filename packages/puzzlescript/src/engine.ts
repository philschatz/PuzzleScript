import { EventEmitter2 } from 'eventemitter2'
import { logger } from './logger'
import { CollisionLayer } from './models/collisionLayer'
import { GameData } from './models/game'
import { A11Y_MESSAGE, A11Y_MESSAGE_TYPE, IMutation, SimpleRuleGroup } from './models/rule'
import { GameSprite, IGameTile } from './models/tile'
import { Command, COMMAND_TYPE, LEVEL_TYPE, SoundItem } from './parser/astTypes'
import { Comparator } from './sortedList'
import { SpriteBitSet } from './spriteBitSet'
import { _flatten, Cellish, GameEngineHandler, INPUT_BUTTON, Optional, resetRandomSeed, RULE_DIRECTION, setAddAll, setDifference, setEquals } from './util'

type ICollisionLayerState = {
    readonly wantsToMove: Optional<RULE_DIRECTION>
    readonly sprite: GameSprite
}

type ITickResult = {
    changedCells: Set<Cell>,
    didWinGame: boolean,
    didLevelChange: boolean,
    wasAgainTick: boolean,
}

type Snapshot = Array<Array<Set<GameSprite>>>

class ArrayAndMap<K, V> {
    private readonly comparator: Comparator<K>
    private readonly map: Map<K, V>
    private keysArray: K[]
    constructor(comparator: Comparator<K>) {
        this.comparator = comparator
        this.keysArray = []
        this.map = new Map()
    }
    public keys() { return this.keysArray }
    public values() { return this.map.values() }
    public set(key: K, value: V) {
        if (!this.map.has(key)) {
            this.insertSorted(key)
        }
        this.map.set(key, value)
    }
    public get(key: K) {
        return this.map.get(key)
    }
    public delete(key: K) {
        if (this.map.has(key)) {
            const index = this.keysArray.indexOf(key)
            if (index < 0) {
                throw new Error(`BUG: Item not found`)
            }
            this.keysArray.splice(index, 1)
        }
        this.map.delete(key)
    }
    private insertSorted(key: K) {
        this.keysArray.push(key)
        this.keysArray = this.keysArray.sort(this.comparator)
    }
}

/**
 * The state of sprites in one position of the current level being played.
 *
 * This stores all the sprites and which direction those sprites want to move.
 *
 * The [[TerminalUI]] uses this object to render and the [[GameEngine]] uses this to maintain the state
 * of one position of the current level.
 */
export class Cell implements Cellish {
    public readonly rowIndex: number
    public readonly colIndex: number
    public readonly spriteBitSet: SpriteBitSet
    private readonly level: Optional<Level>
    private readonly state: ArrayAndMap<CollisionLayer, ICollisionLayerState>
    private cacheCollisionLayers: CollisionLayer[]
    private cachedKeyValue: Optional<string>

    constructor(level: Optional<Level>, sprites: Set<GameSprite>, rowIndex: number, colIndex: number) {
        this.level = level
        this.rowIndex = rowIndex
        this.colIndex = colIndex
        this.state = new ArrayAndMap((c1, c2) => c1.id - c2.id)
        this.cacheCollisionLayers = []
        this.spriteBitSet = new SpriteBitSet(sprites)
        this.cachedKeyValue = null

        for (const sprite of sprites) {
            this._setWantsToMove(sprite, RULE_DIRECTION.STATIONARY)
        }
    }
    public _setWantsToMove(sprite: GameSprite, wantsToMove: Optional<RULE_DIRECTION>) {
        const collisionLayer = sprite.getCollisionLayer()
        const { wantsToMove: cellWantsToMove, sprite: cellSprite } = this.getStateForCollisionLayer(collisionLayer)
        const didActuallyChangeDir = cellWantsToMove !== wantsToMove
        const didActuallyChangeSprite = cellSprite !== sprite
        // replace the sprite in the bitSet
        if (cellSprite !== sprite) {
            if (cellSprite) {
                throw new Error(`BUG: Should have already been removed?`)
                // this.spriteBitSet.remove(cellSprite)
            }
            this.spriteBitSet.add(sprite)
        }

        this._setState(collisionLayer, sprite, wantsToMove)
        // call replaceSprite only **after** we updated the Cell
        if (cellSprite !== sprite) {
            this.replaceSpriteInLevel(cellSprite, sprite)
        }
        return didActuallyChangeSprite || didActuallyChangeDir
    }
    public _deleteWantsToMove(sprite: GameSprite) {
        // There may be other sprites in the same ... oh wait, no that's not possible.
        const collisionLayer = sprite.getCollisionLayer()
        const cellSprite = this.getSpriteByCollisionLayer(collisionLayer)
        const didActuallyChange = !!cellSprite

        if (cellSprite) {
            this.spriteBitSet.remove(cellSprite)
        }

        this._setState(collisionLayer, null, null) // delete the entry

        return didActuallyChange
    }
    public setWantsToMoveCollisionLayer(collisionLayer: CollisionLayer, wantsToMove: RULE_DIRECTION) {
        // Check that there is a sprite for this collision layer
        const { sprite, wantsToMove: cellWantsToMove } = this.getStateForCollisionLayer(collisionLayer)
        if (!sprite) {
            throw new Error(`BUG: No sprite for collision layer. Cannot set direction.\n${collisionLayer.toString()}`)
        }
        const didActuallyChange = cellWantsToMove !== wantsToMove

        this._setState(collisionLayer, sprite, wantsToMove)

        sprite.updateCell(this, wantsToMove)
        return didActuallyChange
    }
    public getSpriteByCollisionLayer(collisionLayer: CollisionLayer) {
        const { sprite } = this.getStateForCollisionLayer(collisionLayer)
        return sprite || null
    }
    public getCollisionLayers() {
        // return [...this._state.keys()]
        //     .sort((c1, c2) => c1.id - c2.id)
        return this.cacheCollisionLayers
    }
    public getSprites() {
        // Just pull out the sprite, not the wantsToMoveDir
        const sprites: GameSprite[] = []
        const collisionLayers = this.getCollisionLayers()
        for (const collisionLayer of collisionLayers) {
            const sprite = this.getSpriteByCollisionLayer(collisionLayer)
            if (sprite) {
                sprites.push(sprite)
            }
        }
        return sprites.reverse() // reversed so we render sprites properly
    }
    public getSpritesAsSet() {
        // SLOW: Time sink
        // Just pull out the sprite, not the wantsToMoveDir
        const sprites = new Set<GameSprite>()
        for (const { sprite } of this.state.values()) {
            sprites.add(sprite)
        }
        return sprites
    }
    public getSpriteAndWantsToMoves() {
        // Just pull out the sprite, not the wantsToMoveDir
        // Retur na new set so we can mutate it later
        const map = new Map()
        for (const collisionLayer of this.getCollisionLayers()) {
            const { sprite, wantsToMove } = this.getStateForCollisionLayer(collisionLayer)
            map.set(sprite, wantsToMove)
        }
        return map
    }
    public getCollisionLayerWantsToMove(collisionLayer: CollisionLayer) {
        const { wantsToMove } = this.getStateForCollisionLayer(collisionLayer)
        return wantsToMove || null
    }
    public hasSprite(sprite: GameSprite) {
        const cellSprite = this.getSpriteByCollisionLayer(sprite.getCollisionLayer())
        return sprite === cellSprite
    }
    public getNeighbor(direction: string) {
        switch (direction) {
            case RULE_DIRECTION.UP:
                return this.getRelativeNeighbor(-1, 0)
            case RULE_DIRECTION.DOWN:
                return this.getRelativeNeighbor(1, 0)
            case RULE_DIRECTION.LEFT:
                return this.getRelativeNeighbor(0, -1)
            case RULE_DIRECTION.RIGHT:
                return this.getRelativeNeighbor(0, 1)
            default:
                throw new Error(`BUG: Unsupported direction "${direction}"`)
        }
    }
    public getWantsToMove(sprite: GameSprite) {
        return this.getCollisionLayerWantsToMove(sprite.getCollisionLayer())
    }
    public hasCollisionWithSprite(otherSprite: GameSprite) {
        return !!this.getCollisionLayerWantsToMove(otherSprite.getCollisionLayer())
    }
    public clearWantsToMove(sprite: GameSprite) {
        this._setWantsToMove(sprite, RULE_DIRECTION.STATIONARY)
        sprite.updateCell(this, RULE_DIRECTION.STATIONARY)
    }
    public addSprite(sprite: GameSprite, wantsToMove: Optional<RULE_DIRECTION>) {
        let didActuallyChange = false
        // If we already have a sprite in that collision layer then we need to remove it
        const prevSprite = this.getSpriteByCollisionLayer(sprite.getCollisionLayer())
        const prevWantsToMove = this.getCollisionLayerWantsToMove(sprite.getCollisionLayer())
        if (prevSprite && prevSprite !== sprite) {
            this.removeSprite(prevSprite)
        }
        if (wantsToMove) {
            didActuallyChange = this._setWantsToMove(sprite, wantsToMove)
        } else if (!this.hasSprite(sprite)) {
            wantsToMove = prevWantsToMove || RULE_DIRECTION.STATIONARY // try to preserve the wantsToMove
            didActuallyChange = this._setWantsToMove(sprite, wantsToMove)
        }
        sprite.addCell(this, wantsToMove)
        return didActuallyChange
    }
    public updateSprite(sprite: GameSprite, wantsToMove: RULE_DIRECTION) {
        // Copy/pasta from addSprite except it calls updateCell
        let didActuallyChange = false
        // If we already have a sprite in that collision layer then we need to remove it
        const prevSprite = this.getSpriteByCollisionLayer(sprite.getCollisionLayer())
        if (prevSprite !== sprite) {
            throw new Error(`BUG: Should not be trying to update the direction of a sprite that is not in the cell`)
        }
        if (wantsToMove) {
            didActuallyChange = this._setWantsToMove(sprite, wantsToMove)
        } else if (!this.hasSprite(sprite)) {
            throw new Error(`BUG: sprite should already be in the cell since we are updating it`)
        }
        sprite.updateCell(this, wantsToMove)
        return didActuallyChange
    }
    public removeSprite(sprite: GameSprite) {
        const didActuallyChange = this._deleteWantsToMove(sprite)
        sprite.removeCell(this)
        return didActuallyChange
    }
    public toString() {
        return `Cell [${this.rowIndex}][${this.colIndex}] ${[...this.getSpriteAndWantsToMoves().entries()].map(([sprite, wantsToMove]) => `${wantsToMove} ${sprite.getName()}`).join(' ')}`
    }
    public toKey() {
        if (!this.cachedKeyValue) {
            const strs = []
            for (const { sprite, wantsToMove } of this.state.values()) {
                strs.push(`${wantsToMove} ${sprite.getName()}`)
            }
            this.cachedKeyValue = strs.join(' ')
        }
        return this.cachedKeyValue
    }
    public toSnapshot() {
        return this.getSpritesAsSet()
    }
    public fromSnapshot(newSprites: Set<GameSprite>) {
        const currentSprites = this.getSpritesAsSet()
        const spritesToRemove = setDifference(currentSprites, newSprites)
        const spritesToAdd = setDifference(newSprites, currentSprites)
        // Remove Sprites
        this.removeSprites(spritesToRemove)
        // Add Sprites
        this.addSprites(spritesToAdd)
    }
    // This method is replaced by LetterCells (because they are not boud to a level)
    protected replaceSpriteInLevel(cellSprite: Optional<GameSprite>, newSprite: GameSprite) { //eslint-disable-line @typescript-eslint/no-unused-vars
        this.getLevel().replaceSprite(this)
    }
    private _setState(collisionLayer: CollisionLayer, sprite: Optional<GameSprite>, wantsToMove: Optional<RULE_DIRECTION>) {
        let needsToUpdateCache
        if (sprite) {
            needsToUpdateCache = this.cacheCollisionLayers.indexOf(collisionLayer) < 0
            this.state.set(collisionLayer, { wantsToMove, sprite })
        } else {
            this.state.delete(collisionLayer)
            needsToUpdateCache = true
        }

        if (needsToUpdateCache) {
            // Update the collisionLayer Cache
            this.cacheCollisionLayers = this.state.keys()
        }
        this.invalidateKey()
    }
    private getLevel() {
        if (!this.level) {
            throw new Error(`BUG: we need an engine Level in order to find neighbors. It is optional for letters in messages`)
        }
        return this.level
    }
    private getStateForCollisionLayer(collisionLayer: CollisionLayer) {
        const state = this.state.get(collisionLayer)
        if (!state) {
            return { wantsToMove: null, sprite: null }
        }
        return state
    }

    private getRelativeNeighbor(y: number, x: number) {
        return this.getLevel().getCellOrNull(this.rowIndex + y, this.colIndex + x)
    }
    private removeSprites(sprites: Iterable<GameSprite>) {
        for (const sprite of sprites) {
            this.removeSprite(sprite)
        }
    }
    private addSprites(sprites: Iterable<GameSprite>) {
        for (const sprite of sprites) {
            this.addSprite(sprite, null)
        }
    }
    private invalidateKey() {
        this.cachedKeyValue = null
    }
}

export class Level {
    private cells: Optional<Cell[][]>
    private rowCache: Array<Optional<SpriteBitSet>>
    private colCache: Array<Optional<SpriteBitSet>>
    constructor() {
        this.rowCache = []
        this.colCache = []
        this.cells = null
    }
    public setCells(cells: Cell[][]) {
        this.cells = cells
    }
    public getCells() {
        if (!this.cells) {
            throw new Error(`BUG: Should have called setCells() first`)
        }
        return this.cells
    }
    public getCellOrNull(rowIndex: number, colIndex: number) {
        const row = this.getCells()[rowIndex]
        if (row) {
            return row[colIndex]
        }
        return null
    }
    public getCell(rowIndex: number, colIndex: number) {
        // Skip error checks for performance
        return this.getCells()[rowIndex][colIndex]
    }
    public replaceSprite(cell: Cell) {
        // When a new Cell is instantiated it will call this method but `this.cells` is not defined yet
        if (this.cells) {
            // Invalidate the row/column cache. It will be rebuilt when requested
            this.rowCache[cell.rowIndex] = null
            this.colCache[cell.colIndex] = null
        }
    }
    public rowContainsSprites(rowIndex: number, spritesPresent: SpriteBitSet, anySpritesPresent: SpriteBitSet) {
        let cache = this.rowCache[rowIndex]
        if (!cache) {
            cache = this.computeRowCache(rowIndex)
            this.rowCache[rowIndex] = cache
        }
        return cache.containsAll(spritesPresent) && anySpritesPresent.isEmpty() ? true : cache.containsAny(anySpritesPresent)
    }
    public colContainsSprites(colIndex: number, sprites: SpriteBitSet, anySpritesPresent: SpriteBitSet) {
        let cache = this.colCache[colIndex]
        if (!cache) {
            cache = this.computeColCache(colIndex)
            this.colCache[colIndex] = cache
        }
        return cache.containsAll(sprites) && anySpritesPresent.isEmpty() ? true : cache.containsAny(anySpritesPresent)
    }
    private computeRowCache(rowIndex: number) {
        const cols = this.getCells()[0].length
        const bitSets = []
        for (let index = 0; index < cols; index++) {
            bitSets.push(this.getCell(rowIndex, index).spriteBitSet)
        }
        return (new SpriteBitSet()).union(bitSets)
    }
    private computeColCache(colIndex: number) {
        const rows = this.getCells().length
        const bitSets = []
        for (let index = 0; index < rows; index++) {
            bitSets.push(this.getCell(index, colIndex).spriteBitSet)
        }
        return (new SpriteBitSet()).union(bitSets)
    }
}

/**
 * Internal class that ise used to maintain the state of a level.
 *
 * This should not be called directly. Instead, use [[GameEngine]] .
 */
export class LevelEngine extends EventEmitter2 {
    public readonly gameData: GameData
    public pendingPlayerWantsToMove: Optional<INPUT_BUTTON>
    public hasAgainThatNeedsToRun: boolean
    private currentLevel: Optional<Level>
    private tempOldLevel: Optional<Level>
    private undoStack: Snapshot[]

    constructor(gameData: GameData) {
        super()
        this.gameData = gameData
        this.hasAgainThatNeedsToRun = false
        this.undoStack = []
        this.pendingPlayerWantsToMove = null
        this.currentLevel = null
        this.tempOldLevel = null
    }

    public setLevel(levelNum: number) {
        this.undoStack = []
        this.gameData.clearCaches()

        const levelData = this.gameData.levels[levelNum]
        if (!levelData) {
            throw new Error(`Invalid levelNum: ${levelNum}`)
        }
        if (levelData.type === LEVEL_TYPE.MAP) {
            resetRandomSeed()

            const levelSprites = levelData.cells.map((row) => {
                return row.map((col) => {
                    const sprites = new Set(col.getSprites())
                    const backgroundSprite = this.gameData.getMagicBackgroundSprite()
                    if (backgroundSprite) {
                        sprites.add(backgroundSprite)
                    }
                    return sprites
                })
            })

            // Clone the board because we will be modifying it
            this._setLevel(levelSprites)

            if (this.gameData.metadata.runRulesOnLevelStart) {
                const { messageToShow, isWinning, hasRestart } = this.tick()
                if (messageToShow || isWinning || hasRestart) {
                    console.log(`Error: Game should not cause a sound/message/win/restart during the initial tick. "${messageToShow}" "${isWinning}" "${hasRestart}"`) // tslint:disable-line:no-console
                }
            }
            this.takeSnapshot(this.createSnapshot())

            // Return the cells so the UI can listen to when they change
            return this.getCells()
        } else {
            throw new Error(`BUG: LEVEL_MESSAGE should not reach this point`)
        }
    }

    public setMessageLevel(sprites: Array<Array<Set<GameSprite>>>) {
        this.tempOldLevel = this.currentLevel
        this._setLevel(sprites)
    }

    public restoreFromMessageLevel() {
        this.currentLevel = this.tempOldLevel
        this.tempOldLevel = null
        // this.setLevel(this.tempOldLevel)
    }

    public getCurrentLevel() {
        if (this.currentLevel) {
            return this.currentLevel
        } else {
            throw new Error(`BUG: There is no current level. Maybe it is a message level or maybe setLevel was never called`)
        }
    }

    public toSnapshot() {
        return this.getCurrentLevel().getCells().map((row) => {
            return row.map((cell) => {
                const ret: string[] = []
                cell.getSpriteAndWantsToMoves().forEach((wantsToMove, sprite) => {
                    ret.push(`${wantsToMove} ${sprite.getName()}`)
                })
                return ret
            })
        })
    }

    public tick() {
        logger.debug(() => ``)

        if (this.hasAgainThatNeedsToRun) {
            // run the AGAIN rules
            this.hasAgainThatNeedsToRun = false // let the .tick() make it true
        }
        switch (this.pendingPlayerWantsToMove) {
            case INPUT_BUTTON.UNDO:
                this.doUndo()
                this.pendingPlayerWantsToMove = null
                return {
                    changedCells: new Set(this.getCells()),
                    soundToPlay: null,
                    messageToShow: null,
                    hasCheckpoint: false,
                    hasRestart: false,
                    isWinning: false,
                    mutations: [],
                    a11yMessages: []
                }
            case INPUT_BUTTON.RESTART:
                this.doRestart()
                this.pendingPlayerWantsToMove = null
                return {
                    changedCells: new Set(this.getCells()),
                    soundToPlay: null,
                    messageToShow: null,
                    hasCheckpoint: false,
                    hasRestart: true,
                    isWinning: false,
                    mutations: [],
                    a11yMessages: []
                }
            default:
              // no-op
        }
        const ret = this.tickNormal()
        // TODO: Handle the commands like RESTART, CANCEL, WIN at this point
        let soundToPlay: Optional<SoundItem<IGameTile>> = null
        let messageToShow: Optional<string> = null
        let hasCheckpoint = false
        let hasWinCommand = false
        let hasRestart = false
        for (const command of ret.commands) {
            switch (command.type) {
                case COMMAND_TYPE.RESTART:
                    hasRestart = true
                    break
                case COMMAND_TYPE.SFX:
                    soundToPlay = command.sound
                    break
                case COMMAND_TYPE.MESSAGE:
                    this.hasAgainThatNeedsToRun = false // make sure we won't be waiting on another tick
                    messageToShow = command.message
                    break
                case COMMAND_TYPE.WIN:
                    hasWinCommand = true
                    break
                case COMMAND_TYPE.CHECKPOINT:
                    hasCheckpoint = true
                    break
                case COMMAND_TYPE.AGAIN:
                case COMMAND_TYPE.CANCEL:
                    break
                default:
                    throw new Error(`BUG: Unsupported command "${command}"`)
            }
        }
        logger.debug(() => `checking win condition.`)
        if (this.hasAgainThatNeedsToRun) {
            logger.debug(() => `AGAIN command executed, with changes detected - will execute another turn.`)
        }

        return {
            changedCells: new Set(ret.changedCells.keys()),
            hasCheckpoint,
            soundToPlay,
            messageToShow,
            hasRestart,
            isWinning: hasWinCommand || this.isWinning(),
            mutations: ret.mutations,
            a11yMessages: ret.a11yMessages
        }
    }

    public hasAgain() {
        return this.hasAgainThatNeedsToRun
    }

    public canUndo() {
        return this.undoStack.length > 1
    }

    public press(button: INPUT_BUTTON) {
        return this.pressDir(button)
    }

    public /*for testing*/ tickUpdateCells() {
        logger.debug(() => `applying rules`)
        return this._tickUpdateCells(this.gameData.rules.filter((r) => !r.isLate()))
    }

    public /*only for unit tests*/ tickMoveSprites(changedCells: Set<Cell>) {
        const movedCells: Set<Cell> = new Set()
        const a11yMessages: Array<A11Y_MESSAGE<Cell, GameSprite>> = []
        // Loop over all the cells, see if a Rule matches, apply the transition, and notify that cells changed
        let somethingChanged
        do {
            somethingChanged = false
            for (const cell of changedCells) {
                for (const [sprite, wantsToMove] of cell.getSpriteAndWantsToMoves()) {

                    switch (wantsToMove) {
                        case RULE_DIRECTION.STATIONARY:
                            // nothing to do
                            break
                        case RULE_DIRECTION.ACTION:
                            // just clear the wantsToMove flag
                            somethingChanged = true
                            cell.clearWantsToMove(sprite)
                            break
                        case RULE_DIRECTION.UP:
                        case RULE_DIRECTION.DOWN:
                        case RULE_DIRECTION.LEFT:
                        case RULE_DIRECTION.RIGHT: {
                            const neighbor = cell.getNeighbor(wantsToMove)
                            // Make sure
                            if (neighbor && !neighbor.hasCollisionWithSprite(sprite)) {
                                cell.removeSprite(sprite)
                                neighbor.addSprite(sprite, RULE_DIRECTION.STATIONARY)
                                movedCells.add(neighbor)
                                movedCells.add(cell)
                                somethingChanged = true

                                a11yMessages.push({ type: A11Y_MESSAGE_TYPE.MOVE, oldCell: cell, newCell: neighbor, sprite, direction: wantsToMove })
                                // Don't delete until we are sure none of the sprites want to move
                                // changedCells.delete(cell)
                            } else {
                                // Clear the wantsToMove flag LATER if we hit a wall (a sprite in the same collisionLayer) or are at the end of the map
                                // We do this later because we are looping as long as something changed
                                // cell.clearWantsToMove(sprite)
                            }
                            break
                        } default:
                            throw new Error(`BUG: wantsToMove should have been handled earlier: ${wantsToMove}`)
                    }
                }
            }
        } while (somethingChanged)

        // Clear the wantsToMove from all remaining cells
        for (const cell of changedCells) {
            for (const [sprite] of cell.getSpriteAndWantsToMoves()) {
                cell.clearWantsToMove(sprite)
            }
        }
        return { movedCells, a11yMessages }
    }

    // Used for UNDO and RESTART
    public createSnapshot() {
        return this.getCurrentLevel().getCells().map((row) => row.map((cell) => cell.toSnapshot()))
    }

    private pressDir(direction: INPUT_BUTTON) {
        // Should disable keypresses if `AGAIN` is running.
        // It is commented because the didSpritesChange logic is not correct.
        // a rule might add a sprite, and then another rule might remove a sprite.
        // We need to compare the set of sprites before and after ALL rules ran.
        // This will likely be implemented as part of UNDO or CHECKPOINT.
        // if (!this.hasAgain()) {
        this.pendingPlayerWantsToMove = direction
        // }
    }
    private doRestart() {
        // Add the initial checkpoint to the top (rather than clearing the stack)
        // so the player can still "UNDO" after pressing "RESTART"
        const snapshot = this.undoStack[0]
        this.undoStack.push(snapshot)
        this.applySnapshot(snapshot)
    }
    private doUndo() {
        const snapshot = this.undoStack.pop()
        if (snapshot && this.undoStack.length > 0) { // the 0th entry is the initial load of the level
            this.applySnapshot(snapshot)
        } else if (snapshot) {
            // oops, put the snapshot back on the stack
            this.undoStack.push(snapshot)
        }
    }

    private _setLevel(levelSprites: Array<Array<Set<GameSprite>>>) {
        const level = new Level()
        this.currentLevel = level
        const spriteCells = levelSprites.map((row, rowIndex) => {
            return row.map((sprites, colIndex) => {
                const backgroundSprite = this.gameData.getMagicBackgroundSprite()
                if (backgroundSprite) {
                    sprites.add(backgroundSprite)
                }
                return new Cell(level, sprites, rowIndex, colIndex)
            })
        })
        level.setCells(spriteCells)
        // link up all the cells. Loop over all the sprites
        // in case they are NO tiles (so the cell is included)
        const batchCells: Map<string, Cell[]> = new Map()
        function spriteSetToKey(sprites: Set<GameSprite>) {
            const key = []
            for (const spriteName of [...sprites].map((sprite) => sprite.getName()).sort()) {
                key.push(spriteName)
            }
            return key.join(' ')
        }
        const allCells = this.getCells()
        // But first, fill up any empty condition brackets with ALL THE CELLS
        for (const rule of this.gameData.rules) {
            rule.addCellsToEmptyRules(allCells)
        }
        for (const cell of allCells) {
            const key = spriteSetToKey(cell.getSpritesAsSet())
            let batch = batchCells.get(key)
            if (!batch) {
                batch = []
                batchCells.set(key, batch)
            }
            batch.push(cell)
        }
        // Print progress while loading up the Cells
        let i = 0
        for (const [key, cells] of batchCells) {
            if ((batchCells.size > 100 && i % 10 === 0) || cells.length > 100) {
                this.emit('loading-cells', {
                    cellStart: i,
                    cellEnd: i + cells.length,
                    cellTotal: allCells.length,
                    key
                })
            }
            // All Cells contain the same set of sprites so just pull out the 1st one
            for (const sprite of this.gameData.objects) {
                const cellSprites = cells[0].getSpritesAsSet()
                const hasSprite = cellSprites.has(sprite)
                if (hasSprite || sprite.hasNegationTileWithModifier()) {
                    if (hasSprite) {
                        sprite.addCells(sprite, cells, RULE_DIRECTION.STATIONARY)
                    } else {
                        sprite.removeCells(sprite, cells)
                    }
                }
            }
            i += cells.length
        }
        return level
    }

    private getCells() {
        return _flatten(this.getCurrentLevel().getCells())
    }

    private tickUpdateCellsLate() {
        logger.debug(() => `applying late rules`)
        return this._tickUpdateCells(this.gameData.rules.filter((r) => r.isLate()))
    }

    private _tickUpdateCells(rules: Iterable<SimpleRuleGroup>) {
        const changedMutations: Set<IMutation> = new Set()
        const a11yMessages: Array<A11Y_MESSAGE<Cell, GameSprite>> = []
        const evaluatedRules: SimpleRuleGroup[] = []
        if (!this.currentLevel) {
            throw new Error(`BUG: Level Cells do not exist yet`)
        }
        for (const rule of rules) {
            const cellMutations = rule.evaluate(this.currentLevel, false/*evaluate all rules*/)
            if (cellMutations.length > 0) {
                evaluatedRules.push(rule)
            }
            for (const mutation of cellMutations) {
                changedMutations.add(mutation)
                for (const message of mutation.messages) {
                    a11yMessages.push(message)
                }
            }
        }

        // We may have mutated the same cell 4 times (e.g. [Player]->[>Player]) so consolidate
        const changedCells = new Set<Cell>()
        const commands: Set<Command<SoundItem<IGameTile>>> = new Set()
        for (const mutation of changedMutations) {
            if (mutation.hasCell()) {
                changedCells.add(mutation.getCell())
            } else {
                commands.add(mutation.getCommand())
            }
        }
        return { evaluatedRules, changedCells, commands, mutations: changedMutations, a11yMessages }
    }

    private tickNormal() {
        let changedCellMutations = new Set<Cell>()
        const initialSnapshot = this.createSnapshot()
        if (this.pendingPlayerWantsToMove) {
            this.takeSnapshot(initialSnapshot)

            logger.debug(`=======================\nTurn starts with input of ${this.pendingPlayerWantsToMove.toLowerCase()}.`)

            const t = this.gameData.getPlayer()
            for (const cell of t.getCellsThatMatch(_flatten(this.getCurrentLevel().getCells()))) {
                for (const sprite of t.getSpritesThatMatch(cell)) {
                    cell.updateSprite(sprite, inputButtonToRuleDirection(this.pendingPlayerWantsToMove))
                    changedCellMutations.add(cell)
                }
            }
            this.pendingPlayerWantsToMove = null
        } else {
            logger.debug(() => `Turn starts with no input.`)
        }

        const { changedCells: changedCellMutations2, evaluatedRules, commands, mutations, a11yMessages: a11yMessages1 } = this.tickUpdateCells()
        changedCellMutations = setAddAll(changedCellMutations, changedCellMutations2)

        // Continue evaluating again rules only when some sprites have changed
        // The didSpritesChange logic is not correct.
        // a rule might add a sprite, and then another rule might remove a sprite.
        // We need to compare the set of sprites before and after ALL rules ran.
        // This will likely be implemented as part of UNDO or CHECKPOINT.
        const { movedCells, a11yMessages: a11yMessages2 } = this.tickMoveSprites(new Set<Cell>(changedCellMutations.keys()))
        const { changedCells: changedCellsLate, evaluatedRules: evaluatedRulesLate, commands: commandsLate, mutations: mutationsLate, a11yMessages: a11yMessages3 } = this.tickUpdateCellsLate()
        const allCommands = [...commands, ...commandsLate]
        const didCancel = !!allCommands.filter((c) => c.type === COMMAND_TYPE.CANCEL)[0]
        if (didCancel) {
            this.hasAgainThatNeedsToRun = false
            if (this.undoStack.length > 0) {
                this.applySnapshot(this.undoStack[this.undoStack.length - 1])
            }
            return {
                changedCells: new Set<Cell>(),
                checkpoint: null,
                commands: new Set<Command<SoundItem<IGameTile>>>(),
                evaluatedRules,
                mutations: new Set<IMutation>(),
                a11yMessages: []
            }
        }
        let checkpoint: Optional<Snapshot> = null
        const didCheckpoint = !!allCommands.find((c) => c.type === COMMAND_TYPE.CHECKPOINT)
        if (didCheckpoint) {
            this.undoStack = []
            checkpoint = this.createSnapshot()
            this.takeSnapshot(checkpoint)
        }
        // set this only if we did not CANCEL and if some cell changed
        const changedCells = setAddAll(setAddAll(changedCellMutations, changedCellsLate), movedCells)
        if (allCommands.find((c) => c.type === COMMAND_TYPE.AGAIN)) {
            // Compare all the cells to the top of the undo stack. If it does not differ
            this.hasAgainThatNeedsToRun = this.doSnapshotsDiffer(initialSnapshot, this.createSnapshot())
        }
        // reduce the changedCells based on what was in the cell before the tick
        const realChangedCells = this.getRealChangedCells(initialSnapshot, changedCells)
        const realA11yMessages = this.getRealA11yMessages(realChangedCells, [...a11yMessages1, ...a11yMessages2, ...a11yMessages3])
        return {
            changedCells: realChangedCells,
            evaluatedRules: evaluatedRules.concat(evaluatedRulesLate),
            commands: allCommands,
            mutations: new Set([...mutations, ...mutationsLate]),
            a11yMessages: realA11yMessages
        }
    }

    private getRealA11yMessages(changedCells: Set<Cell>, a11yMessages: Array<A11Y_MESSAGE<Cell, GameSprite>>) {
        return a11yMessages.filter((m) => {
            switch (m.type) {
                case A11Y_MESSAGE_TYPE.ADD:
                case A11Y_MESSAGE_TYPE.REPLACE:
                case A11Y_MESSAGE_TYPE.REMOVE:
                    return changedCells.has(m.cell)
                case A11Y_MESSAGE_TYPE.MOVE:
                    return changedCells.has(m.oldCell) || changedCells.has(m.newCell)
            }
        })
    }
    private getRealChangedCells(initialSnapshot: Snapshot, changedCells: Set<Cell>) {
        const realChangedCells = new Set<Cell>()
        for (const cell of changedCells) {
            if (!setEquals(cell.getSpritesAsSet(), initialSnapshot[cell.rowIndex][cell.colIndex])) {
                realChangedCells.add(cell)
            }
        }
        return realChangedCells
    }

    private isWinning() {
        let conditionsSatisfied = this.gameData.winConditions.length > 0
        this.gameData.winConditions.forEach((winCondition) => {
            if (!winCondition.isSatisfied(this.getCells())) {
                conditionsSatisfied = false
            }
        })
        return conditionsSatisfied
    }
    private takeSnapshot(snapshot: Snapshot) {
        this.undoStack.push(snapshot)
    }
    private applySnapshot(snpashot: Snapshot) {
        const cells = this.getCurrentLevel().getCells()
        for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
            const row = cells[rowIndex]
            const snapshotRow = snpashot[rowIndex]
            for (let colIndex = 0; colIndex < row.length; colIndex++) {
                const cell = row[colIndex]
                const state = snapshotRow[colIndex]
                cell.fromSnapshot(state)
            }
        }
    }
    private doSnapshotsDiffer(snapshot1: Snapshot, snapshot2: Snapshot) {
        for (let rowIndex = 0; rowIndex < snapshot1.length; rowIndex++) {
            for (let colIndex = 0; colIndex < snapshot1[0].length; colIndex++) {
                const sprites1 = snapshot1[rowIndex][colIndex]
                const sprites2 = snapshot2[rowIndex][colIndex]
                if (!setEquals(sprites1, sprites2)) {
                    return true
                }
            }
        }
        return false
    }
}

export type ILoadingCellsEvent = {
    cellStart: number,
    cellEnd: number,
    cellTotal: number,
    key: string
}
export type ILoadingProgressHandler = (info: ILoadingCellsEvent) => void

export type CellSaveState = string[][][]

/**
 * Maintains the state of the game. Here is an example flow:
 *
 * ```js
 * const engine = new GameEngine(gameData)
 * engine.setLevel(0)
 * engine.pressRight()
 * engine.tick()
 * engine.tick()
 * engine.pressUp()
 * engine.tick()
 * engine.pressUndo()
 * engine.tick()
 * ```
 */
export class GameEngine {
    private levelEngine: LevelEngine
    private currentLevelNum: number
    private handler: GameEngineHandler
    constructor(gameData: GameData, handler: GameEngineHandler) {
        this.currentLevelNum = -1234567
        this.handler = handler

        this.levelEngine = new LevelEngine(gameData)
    }
    public on(eventName: string, handler: ILoadingProgressHandler) {
        this.levelEngine.on(eventName, handler)
    }
    public getGameData() {
        return this.levelEngine.gameData
    }
    public getCurrentLevelCells() {
        return this.levelEngine.getCurrentLevel().getCells()
    }
    public getCurrentLevel() {
        return this.getGameData().levels[this.getCurrentLevelNum()]
    }
    public getCurrentLevelNum() {
        return this.currentLevelNum
    }
    public hasAgain() {
        return this.levelEngine.hasAgain()
    }
    public setLevel(levelNum: number, checkpoint: Optional<CellSaveState>) {
        this.levelEngine.hasAgainThatNeedsToRun = false
        this.currentLevelNum = levelNum
        const level = this.getGameData().levels[levelNum]
        if (level.type === LEVEL_TYPE.MAP) {
            this.handler.onLevelLoad(levelNum, { rows: level.cells.length, cols: level.cells[0].length })
            this.levelEngine.setLevel(levelNum)
            if (checkpoint) {
                this.loadSnapshotFromJSON(checkpoint)
            }
            this.handler.onLevelChange(this.currentLevelNum, this.levelEngine.getCurrentLevel().getCells(), null)
        } else {
            this.handler.onLevelLoad(levelNum, null)
            this.handler.onLevelChange(this.currentLevelNum, null, level.message)
        }
    }
    public async tick(): Promise<ITickResult> {
        // When the current level is a Message, wait until the user presses ACTION
        const currentLevel = this.getCurrentLevel()
        if (currentLevel.type === LEVEL_TYPE.MESSAGE) {
            await this.handler.onMessage(currentLevel.message)
            let didWinGameInMessage = false
            if (this.currentLevelNum === this.levelEngine.gameData.levels.length - 1) {
                this.handler.onWin()
                didWinGameInMessage = true
            } else {
                this.setLevel(this.currentLevelNum + 1, null/*no checkpoint*/)
            }
            // clear any keys that were pressed
            this.levelEngine.pendingPlayerWantsToMove = null

            return {
                changedCells: new Set(),
                didWinGame: didWinGameInMessage,
                didLevelChange: true,
                wasAgainTick: false
            }
        }
        let hasAgain = this.levelEngine.hasAgain()
        if (!hasAgain && !(this.levelEngine.gameData.metadata.realtimeInterval || this.levelEngine.pendingPlayerWantsToMove)) {
            return {
                changedCells: new Set(),
                didWinGame: false,
                didLevelChange: false,
                wasAgainTick: false
            }
        }

        const previousPending = this.levelEngine.pendingPlayerWantsToMove
        const { changedCells, hasCheckpoint, soundToPlay, messageToShow, isWinning, hasRestart, a11yMessages } = this.levelEngine.tick()

        if (previousPending && !this.levelEngine.pendingPlayerWantsToMove) {
            this.handler.onPress(previousPending)
        }

        const checkpoint = hasCheckpoint ? this.saveSnapshotToJSON() : null

        if (hasRestart) {
            this.handler.onTick(changedCells, checkpoint, hasAgain, a11yMessages)
            return {
                changedCells,
                didWinGame: false,
                didLevelChange: false,
                wasAgainTick: false
            }
        }

        hasAgain = this.levelEngine.hasAgain()
        this.handler.onTick(changedCells, checkpoint, hasAgain, a11yMessages)
        let didWinGame = false
        if (isWinning) {
            if (this.currentLevelNum === this.levelEngine.gameData.levels.length - 1) {
                didWinGame = true
                this.handler.onWin()
            } else {
                this.setLevel(this.currentLevelNum + 1, null/*no checkpoint*/)
            }
        }

        if (soundToPlay) {
            await this.handler.onSound(soundToPlay)
        }
        if (messageToShow) {
            await this.handler.onMessage(messageToShow)
        }

        return {
            changedCells,
            didWinGame,
            didLevelChange: isWinning,
            wasAgainTick: hasAgain
        }
    }

    public press(direction: INPUT_BUTTON) {
        this.levelEngine.press(direction)
    }

    public saveSnapshotToJSON(): CellSaveState {
        return this.getCurrentLevelCells().map((row) => row.map((cell) => [...cell.toSnapshot()].map((s) => s.getName())))
    }

    public loadSnapshotFromJSON(json: CellSaveState) {
        json.forEach((rowSave, rowIndex) => {
            rowSave.forEach((cellSave, colIndex) => {
                const cell = this.levelEngine.getCurrentLevel().getCell(rowIndex, colIndex)

                const spritesToHave = cellSave.map((spriteName) => {
                    const sprite = this.getGameData()._getSpriteByName(spriteName)
                    if (sprite) {
                        return sprite
                    } else {
                        throw new Error(`BUG: Could not find sprite to add named ${spriteName}`)
                    }
                })

                cell.fromSnapshot(new Set(spritesToHave))
            })
        })
    }

    public isCurrentLevelAMessage() {
        return this.getCurrentLevel().type === LEVEL_TYPE.MESSAGE
    }
}

function inputButtonToRuleDirection(button: INPUT_BUTTON) {
    switch (button) {
        case INPUT_BUTTON.UP: return RULE_DIRECTION.UP
        case INPUT_BUTTON.DOWN: return RULE_DIRECTION.DOWN
        case INPUT_BUTTON.LEFT: return RULE_DIRECTION.LEFT
        case INPUT_BUTTON.RIGHT: return RULE_DIRECTION.RIGHT
        case INPUT_BUTTON.ACTION: return RULE_DIRECTION.ACTION
        default:
            throw new Error(`BUG: Invalid input button at this point. Only up/down/left/right/action are allowed. "${button}"`)
    }
}
