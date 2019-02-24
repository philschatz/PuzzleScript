import { GameData } from '../models/game'
import { A11Y_MESSAGE, A11Y_MESSAGE_TYPE } from '../models/rule'
import { GameSprite } from '../models/tile'
import { LEVEL_TYPE } from '../parser/astTypes'
import Serializer from '../parser/serializer'
import TableUI from '../ui/table'
import { Cellish,
    CellishJson,
    Engineish,
    GameEngineHandlerOptional,
    INPUT_BUTTON,
    MESSAGE_TYPE,
    Optional,
    pollingPromise,
    PuzzlescriptWorker,
    RULE_DIRECTION,
    WorkerResponse} from '../util'
import InputWatcher from './InputWatcher'
import ResizeWatcher from './ResizeWatcher'

class ProxyCellish implements Cellish {
    public readonly rowIndex: number
    public readonly colIndex: number
    public sprites: GameSprite[]

    constructor(rowIndex: number, colIndex: number, sprites: GameSprite[]) {
        this.rowIndex = rowIndex
        this.colIndex = colIndex
        this.sprites = sprites
    }
    public getSprites() {
        return this.sprites
    }
    public getSpritesAsSet() {
        return new Set(this.sprites)
    }
    public getWantsToMove() {
        return RULE_DIRECTION.STATIONARY
    }
}

export default class WebworkerTableEngine implements Engineish {
    public readonly inputWatcher: InputWatcher
    private readonly worker: PuzzlescriptWorker
    private readonly table: HTMLTableElement
    private readonly ui: TableUI
    private readonly resizeWatcher: ResizeWatcher
    private inputInterval: number

    private cellCache: ProxyCellish[][]
    private levelNum: number
    private gameData: Optional<GameData>

    constructor(worker: PuzzlescriptWorker, table: HTMLTableElement, handler?: GameEngineHandlerOptional) {
        this.worker = worker
        this.table = table

        const defaultOnMessage = (msg: string) => {
            return pollingPromise<void>(10, () => {
                // Using a pollingPromise is only necessary for alert() because of the keyUp event not firing
                if (this.inputWatcher.isSomethingPressed()) {
                    return false
                }
                alert(msg)
                return true
            })
        }
        if (!handler || !handler.onMessage) {
            handler = { ...handler, onMessage: defaultOnMessage }
        }

        // cache
        this.cellCache = []
        this.levelNum = -123456
        this.gameData = null

        this.ui = new TableUI(table, handler)
        this.resizeWatcher = new ResizeWatcher(table, this.handleResize.bind(this))
        this.inputWatcher = new InputWatcher(table)

        this.pause = this.pause.bind(this)
        this.resume = this.resume.bind(this)
        this.messageListener = this.messageListener.bind(this)
        this.pollInputWatcher = this.pollInputWatcher.bind(this)

        table.addEventListener('blur', this.pause)
        table.addEventListener('focus', this.resume)

        worker.addEventListener('message', this.messageListener)

        this.inputInterval = window.setInterval(this.pollInputWatcher, 10)
    }
    public setGame(code: string, level: number) {
        this.worker.postMessage({ type: MESSAGE_TYPE.ON_GAME_CHANGE, code, level })
    }

    public dispose() {
        this.inputWatcher.dispose()
        this.resizeWatcher.dispose()
        clearInterval(this.inputInterval)
    }

    private pollInputWatcher() {
        const button = this.inputWatcher.pollControls()
        if (button) {
            this.press(button)
        }
    }

    public press(button: INPUT_BUTTON) {
        this.worker.postMessage({ type: MESSAGE_TYPE.PRESS, button })
    }

    public pause() {
        this.worker.postMessage({ type: MESSAGE_TYPE.PAUSE })
        this.inputInterval && clearInterval(this.inputInterval)
        this.inputInterval = 0
    }

    public resume() {
        this.worker.postMessage({ type: MESSAGE_TYPE.RESUME })
        if (!this.inputInterval) {
            this.inputInterval = window.setInterval(this.pollInputWatcher, 10)
        }
    }
    private async messageListener({ data }: {data: WorkerResponse}) {
        switch (data.type) {
            case MESSAGE_TYPE.ON_GAME_CHANGE:
                const gameData = Serializer.fromJson(data.payload, '**source not included because of laziness**')
                this.gameData = gameData
                this.ui.onGameChange(gameData)
                break
            case MESSAGE_TYPE.ON_LEVEL_CHANGE:
                this.cellCache = [] // clear the cache since the level dimensions are different
                this.levelNum = data.level
                if (data.cells) {
                    this.ui.onLevelChange(data.level, data.cells.map((row) => row.map((x) => this.convertToCellish(x))), null)
                } else {
                    this.ui.onLevelChange(data.level, null, data.message)
                }
                this.resizeWatcher.trigger() // force resize
                this.table.focus()
                break
            case MESSAGE_TYPE.ON_MESSAGE:
                await this.ui.onMessage(data.message)
                this.worker.postMessage({ type: MESSAGE_TYPE.ON_MESSAGE_DONE })
                this.table.focus()
                break
            case MESSAGE_TYPE.ON_PRESS:
                this.ui.onPress(data.direction)
                break
            case MESSAGE_TYPE.ON_TICK:
                this.ui.onTick(new Set(data.changedCells.map((x) => this.convertToCellish(x))), data.hasAgain, this.convertToA11yMessages(data.a11yMessages))
                break
            case MESSAGE_TYPE.ON_SOUND:
                await this.ui.onSound({ soundCode: data.soundCode })
                break
            case MESSAGE_TYPE.ON_PAUSE:
                this.ui.onPause()
                break
            case MESSAGE_TYPE.ON_RESUME:
                this.ui.onResume()
                break

            case MESSAGE_TYPE.TICK:
            case MESSAGE_TYPE.PRESS:
            case MESSAGE_TYPE.PAUSE:
            case MESSAGE_TYPE.RESUME:
                break // less console noise
            default:
                console.log(`BUG: Unhandled Event occurred. Ignoring "${data.type}"`, data) // tslint:disable-line:no-console
        }
    }
    private convertToA11yMessages(a11yMessages: Array<A11Y_MESSAGE<CellishJson, string>>): Array<A11Y_MESSAGE<Cellish, GameSprite>> {
        return a11yMessages.map((message) => {
            switch (message.type) {
                case A11Y_MESSAGE_TYPE.ADD:
                    return { ...message, cell: this.convertToCellish(message.cell), sprites: [...message.sprites].map((n) => this.lookupSprite(n)) }
                case A11Y_MESSAGE_TYPE.MOVE:
                    return { ...message, oldCell: this.convertToCellish(message.oldCell), newCell: this.convertToCellish(message.newCell), sprite: this.lookupSprite(message.sprite) }
                case A11Y_MESSAGE_TYPE.REMOVE:
                    return { ...message, cell: this.convertToCellish(message.cell), sprites: [...message.sprites].map((n) => this.lookupSprite(n)) }
                case A11Y_MESSAGE_TYPE.REPLACE:
                    return {
                        ...message,
                        cell: this.convertToCellish(message.cell),
                        replacements: [...message.replacements].map(({ oldSprite, newSprite }) => ({ oldSprite: this.lookupSprite(oldSprite), newSprite: this.lookupSprite(newSprite) }))
                    }
            }
        })
    }
    private lookupSprite(name: string) {
        const sprite = this.getGameData()._getSpriteByName(name)
        if (!sprite) {
            throw new Error(`Could not find sprite "${name}"`)
        }
        return sprite
    }
    private convertToCellish(c: {rowIndex: number, colIndex: number, spriteNames: string[]}) {
        const { rowIndex, colIndex, spriteNames } = c

        // Lazy-initialize all the proxy cells
        if (!this.cellCache[rowIndex]) {
            this.cellCache[rowIndex] = []
        }
        if (!this.cellCache[rowIndex][colIndex]) {
            this.cellCache[rowIndex][colIndex] = new ProxyCellish(rowIndex, colIndex, [])
        }

        const cell = this.cellCache[rowIndex][colIndex]

        cell.sprites = spriteNames.map((name) => this.lookupSprite(name))

        return cell
    }
    private getGameData() {
        if (!this.gameData) {
            throw new Error(`BUG: Game Data has not been retreived from the worker yet`)
        }
        return this.gameData
    }
    private isCurrentLevelAMessage() {
        return this.getGameData().levels[this.levelNum].type === LEVEL_TYPE.MESSAGE
    }
    private handleResize(width: number) {
        if (!this.isCurrentLevelAMessage()) {
            this.table.setAttribute('style', `width: ${width}px;`)
        }
    }
}
