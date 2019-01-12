import { Cell, GameEngine } from './engine'
import { A11Y_MESSAGE, A11Y_MESSAGE_TYPE } from './models/rule'
import { GameSprite } from './models/tile'
import { Soundish } from './parser/astTypes'
import Parser from './parser/parser'
import Serializer from './parser/serializer'
import { Cellish, CellishJson, GameEngineHandler, INPUT_BUTTON, MESSAGE_TYPE, Optional, pollingPromise, shouldTick, TypedMessageEvent, WorkerMessage, WorkerResponse } from './util'

declare var postMessage: (msg: WorkerResponse) => void

let currentEngine: Optional<GameEngine> = null
let gameLoop: Optional<NodeJS.Timeout> = null
let awaitingMessage = false
let lastTick = 0

onmessage = (event: TypedMessageEvent<WorkerMessage>) => {
    const msg = event.data
    switch (msg.type) {
        case MESSAGE_TYPE.LOAD_GAME: loadGame(msg.code, msg.level); break
        case MESSAGE_TYPE.PAUSE: postMessage({ type: msg.type, payload: pauseGame() }); break
        case MESSAGE_TYPE.RESUME: postMessage({ type: msg.type, payload: resumeGame() }); break
        case MESSAGE_TYPE.PRESS: postMessage({ type: msg.type, payload: press(msg.button) }); break
        case MESSAGE_TYPE.CLOSE: postMessage({ type: msg.type, payload: closeGame() }); break
        case MESSAGE_TYPE.ON_MESSAGE_DONE:
            awaitingMessage = false
            break
        default:
            throw new Error(`ERROR: Unsupported webworker message type "${JSON.stringify(event.data)}"`)
    }
}

const getEngine = () => {
    if (!currentEngine) {
        throw new Error(`Game has not been loaded yet`)
    }
    return currentEngine
}

// This uses setTimeout because when a MESSAGE_DONE is received, we need to resume the game
const runPlayLoop = async() => {
    if (gameLoop) {
        clearTimeout(gameLoop)
        gameLoop = null
    }
    if (awaitingMessage) {
        return
    }
    if (shouldTick(getEngine().getGameData().metadata, lastTick)) {
        lastTick = Date.now()
        await tick()
    }
    gameLoop = setTimeout(runPlayLoop, 20)
}

let previousMessage = '' // a dev-invariant checker that ensures we do not show the same message twice

class Handler implements GameEngineHandler {
    public onPress(dir: INPUT_BUTTON) {
        if (!dir) {
            throw new Error(`BUG: No direction provided to onPress`)
        }
        postMessage({ type: MESSAGE_TYPE.ON_PRESS, direction: dir })
    }
    public async onMessage(msg: string) {
        if (previousMessage === msg) {
            throw new Error(`BUG: Should not show the same message twice. "${msg}"`)
        }
        previousMessage = msg

        pauseGame()
        postMessage({ type: MESSAGE_TYPE.ON_MESSAGE, message: msg })
        // Wait until the user dismissed the message
        if (awaitingMessage) {
            throw new Error(`BUG: should not already be awaiting a message`)
        }
        awaitingMessage = true
        await pollingPromise<boolean>(50, () => !awaitingMessage)
        // resumeGame() No need to resume since we are inside a `await tick()` and at the end of it it will start back up (via a call to setTimeout)
    }
    public onLevelChange(level: number, cells: Optional<Cellish[][]>, message: Optional<string>) {
        let newCells: Optional<CellishJson[][]> = null
        if (cells) {
            newCells = cells.map((row) => toCellsJson(row))
        }
        postMessage({ type: MESSAGE_TYPE.ON_LEVEL_CHANGE, level, cells: newCells, message })
    }
    public onWin() {
        postMessage({ type: MESSAGE_TYPE.ON_WIN })
    }
    public async onSound(sound: Soundish) {
        postMessage({ type: MESSAGE_TYPE.ON_SOUND, soundCode: sound.soundCode })
    }
    public onTick(changedCells: Set<Cellish>, hasAgain: boolean, a11yMessages: Array<A11Y_MESSAGE<Cell, GameSprite>>) {
        postMessage({ type: MESSAGE_TYPE.ON_TICK, changedCells: toCellsJson(changedCells), hasAgain, a11yMessages: a11yMessages.map(toA11yMessageJson) })
    }
    public onPause() {
        postMessage({ type: MESSAGE_TYPE.ON_PAUSE })
    }
    public onResume() {
        postMessage({ type: MESSAGE_TYPE.ON_RESUME })
    }
}

const loadGame = (code: string, level: number) => {
    pauseGame()
    previousMessage = '' // clear this dev-invariant-tester field since it is a new game
    const { data } = Parser.parse(code)
    postMessage({ type: MESSAGE_TYPE.LOAD_GAME, payload: (new Serializer(data)).toJson() })
    currentEngine = new GameEngine(data, new Handler())
    currentEngine.setLevel(level)
    runPlayLoop() // tslint:disable-line:no-floating-promises
}

const pauseGame = () => {
    if (gameLoop !== null) {
        clearTimeout(gameLoop)
        gameLoop = null
        postMessage({ type: MESSAGE_TYPE.ON_PAUSE })
    }
}

const resumeGame = () => {
    postMessage({ type: MESSAGE_TYPE.ON_RESUME })
    runPlayLoop() // tslint:disable-line:no-floating-promises
}

const tick = async() => {
    const engine = getEngine()
    const { changedCells, didWinGame, didLevelChange, wasAgainTick } = await engine.tick()
    // Response needs to be serializable
    return {
        changedCells: toCellsJson(changedCells),
        didWinGame,
        didLevelChange,
        wasAgainTick
    }
}

const toCellsJson = (cells: Iterable<Cellish>) => {
    return [...cells].map(toCellJson)
}

const toCellJson = (cell: Cellish): CellishJson => {
    const { colIndex, rowIndex } = cell
    return {
        colIndex,
        rowIndex,
        spriteNames: cell.getSprites().map((sprite) => sprite.getName())
    }
}

const toA11yMessageJson = (message: A11Y_MESSAGE<Cell, GameSprite>): A11Y_MESSAGE<CellishJson, string> => {
    switch (message.type) {
        case A11Y_MESSAGE_TYPE.ADD:
            return { ...message, cell: toCellJson(message.cell), sprites: [...message.sprites].map(toSpriteName) }
        case A11Y_MESSAGE_TYPE.MOVE:
            return { ...message, oldCell: toCellJson(message.oldCell), newCell: toCellJson(message.newCell), sprite: toSpriteName(message.sprite) }
        case A11Y_MESSAGE_TYPE.REMOVE:
            return { ...message, cell: toCellJson(message.cell), sprites: [...message.sprites].map(toSpriteName) }
        case A11Y_MESSAGE_TYPE.REPLACE:
            return {
                ...message,
                cell: toCellJson(message.cell),
                replacements: [...message.replacements].map(({ oldSprite, newSprite }) => ({ oldSprite: toSpriteName(oldSprite), newSprite: toSpriteName(newSprite) }))
            }
    }
}

const toSpriteName = (sprite: GameSprite) => {
    return sprite.getName()
}

const press = (button: INPUT_BUTTON) => {
    return getEngine().press(button)
}

const closeGame = () => {
    pauseGame()
    currentEngine = null
}
