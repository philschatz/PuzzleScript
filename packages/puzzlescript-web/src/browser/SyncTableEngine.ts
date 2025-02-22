import InputWatcher from '../browser/InputWatcher'
import ResizeWatcher, { LIMITED_BY } from '../browser/ResizeWatcher'
import { CellSaveState, GameEngine, LEVEL_TYPE, Parser, TableUI, EmptyGameEngineHandler, Engineish, GameEngineHandler, GameEngineHandlerOptional, Optional, pollingPromise, Soundish } from 'puzzlescript'
import { playSound } from '../sounds-copypasta/sfxr'

class SubTableEngine {
    public readonly tableUI: TableUI
    public engine: Optional<GameEngine>
    private readonly table: HTMLTableElement
    private readonly inputWatcher: InputWatcher
    private timer: number

    constructor(table: HTMLTableElement, optionalHandler?: GameEngineHandlerOptional) {
        this.table = table
        this.inputWatcher = new InputWatcher(table)

        this.timer = 0
        this.engine = null

        // wait until user is no longer pressing anything before
        // showing the alert().
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1346228
        const messageHandler = {
            onWin() {
                alert('You won the game! Congratulations!')
            },
            async onSound(sound: Soundish) {
                await playSound(sound.soundCode)
            },
            onMessage: async(msg: string) => {
                return pollingPromise<void>(10, () => {
                    if (this.inputWatcher.isSomethingPressed()) {
                        return false
                    }
                    alert(msg)
                    table.focus()
                    return true
                })
            }
        }

        const handler = optionalHandler ? new EmptyGameEngineHandler([{...messageHandler, ...optionalHandler}]) : new EmptyGameEngineHandler([messageHandler])

        this.tableUI = new TableUI(table, handler)
    }
    public setGame(code: string, levelNum: number, checkpoint: Optional<CellSaveState>) {
        const { data } = Parser.parse(code)
        this.engine = new GameEngine(data, this.tableUI)

        this.tableUI.onGameChange(data)
        this.engine.setLevel(levelNum, checkpoint)

        if (data.metadata.keyRepeatInterval) {
            this.inputWatcher.setKeyRepeatInterval(data.metadata.keyRepeatInterval)
        }
    }
    public start() {
        if (this.timer) {
            this.pause()
        }
        this.table.setAttribute('data-ps-state', 'running')
        const runLoop = async() => {
            const pendingKey = this.inputWatcher.pollControls()
            if (pendingKey) {
                this.engine?.press(pendingKey)
            }
            await this.getEngine().tick()
            this.timer = window.requestAnimationFrame(runLoop)
        }

        this.timer = window.requestAnimationFrame(runLoop)
    }
    public pause() {
        this.table.setAttribute('data-ps-state', 'paused')
        cancelAnimationFrame(this.timer)
        this.timer = 0
    }
    public getEngine() {
        if (!this.engine) {
            throw new Error(`BUG: Engine has not been created yet`)
        }
        return this.engine
    }
    public dispose() {
        this.pause()
        this.inputWatcher.dispose()
    }

}

export default class SyncTableEngine implements Engineish {
    private readonly table: HTMLTableElement
    private readonly resizeWatcher: ResizeWatcher
    private readonly subEngine: SubTableEngine
    private readonly handler: GameEngineHandler
    private readonly boundPause: () => void
    private readonly boundResume: () => void

    constructor(table: HTMLTableElement, handler?: GameEngineHandlerOptional) {
        this.table = table
        this.subEngine = new SubTableEngine(table, handler)
        this.resizeWatcher = new ResizeWatcher(table, this.handleResize.bind(this))

        this.handler = new EmptyGameEngineHandler(handler ? [handler, this.subEngine.tableUI] : [this.subEngine.tableUI])

        this.boundPause = this.pause.bind(this)
        this.boundResume = this.resume.bind(this)
        this.table.addEventListener('blur', this.boundPause)
        this.table.addEventListener('focus', this.boundResume)
    }
    public setGame(source: string, level: number = 0, checkpoint: Optional<CellSaveState>) {
        this.subEngine.setGame(source, level, checkpoint)

        const engine = this.subEngine.getEngine()
        if (engine.getCurrentLevel().type === LEVEL_TYPE.MAP) {
            const currentLevel = engine.getCurrentLevelCells()
            this.resizeWatcher.setLevel(currentLevel.length, currentLevel[0].length)
        }
        this.subEngine.start()
        this.table.focus()
        this.resizeWatcher.trigger()
    }
    public dispose() {
        this.subEngine.dispose()
        this.resizeWatcher.dispose()

        this.table.removeEventListener('blur', this.boundPause)
        this.table.removeEventListener('focus', this.boundResume)
    }
    public pause() {
        this.subEngine.pause()
        this.handler.onPause()
    }
    public resume() {
        this.subEngine.start()
        this.handler.onResume()
    }
    private handleResize(width: number, left: number, limitedBy: LIMITED_BY) {
        if (!this.subEngine.getEngine().isCurrentLevelAMessage()) {
            this.table.setAttribute('style', `width: ${width}px`)
            // to fix chrome vertical lines because of fractional pixels
            this.table.parentElement?.setAttribute('style', `left: ${left}px; /*chrome display quirk with fractional pixels*/`)
            document.body.setAttribute('data-ps-game-limited-by', limitedBy)
        }
    }
}
