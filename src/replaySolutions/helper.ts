/* eslint-env jasmine */
import fs from 'fs'
import path from 'path'
import { GameEngine } from '../../src/engine'
import Parser from '../../src/parser/parser'
import { saveCoverageFile } from '../../src/recordCoverage'
import { EmptyGameEngineHandler, INPUT_BUTTON } from '../../src/util'
// import TerminalUI from '../../src/ui/terminal'

const CI_MAX_SOLUTION_LENGTH = 1000 // The length of 1 level of cyber-lasso
const describeFn = process.env.SKIP_SOLUTIONS ? describe.skip : describe

const SOLUTION_ROOT = path.join(__dirname, '../../gist-solutions/')
const solutionFiles = fs.readdirSync(SOLUTION_ROOT)

function parseEngine(code: string, levelNum = 0) {
    const { data } = Parser.parse(code)

    const engine = new GameEngine(data, new EmptyGameEngineHandler())
    return { engine, data }
}

export function createTests(moduloNumber: number, moduloTotal: number) {
    if (process.env.SKIP_SOLUTIONS) {
        describe.skip('Skipping replay tests', () => {
            it.skip('skiping test')
        })
        console.log('Skipping Replay tests') // tslint:disable-line:no-console
        return
    }

    if (process.env.CI === 'true' && (moduloNumber === 7 || moduloNumber === 8)) {
        describe.skip(`Skipping replaySolutions/${moduloNumber}.test because it causes Travis to time out`, () => {
            it.skip('skipping tests')
        })
        return
    }

    describeFn('replays levels of games', () => {
        solutionFiles.forEach((solutionFilename, solutionIndex) => {
            // Skip the README.md file
            if (!solutionFilename.endsWith('.json')) {
                return
            }
            // Only run 1/4 of all the games. This is so JEST can run them concurrently
            if (solutionIndex % moduloTotal !== moduloNumber) {
                return
            }

            const GIST_ID = path.basename(solutionFilename).replace('.json', '')

            it(`plays ${process.env.CI === 'true' ? '*a single level*' : '_the solved levels_'} of ${GIST_ID}`, async() => {
                const gistFilename = path.join(__dirname, `../../gists/${GIST_ID}/script.txt`)
                const { engine, data } = parseEngine(fs.readFileSync(gistFilename, 'utf-8'))
                const recordings = JSON.parse(fs.readFileSync(path.join(SOLUTION_ROOT, solutionFilename), 'utf-8')).solutions

                let numPlayed = 0
                let hasAtLeastOneSolution = 0

                // play games in reverse order because it is likely that the harder levels will fail first
                for (let index = recordings.length - 1; index >= 0; index--) {
                // for (let index = 0; index < recordings.length; index++) {
                    const recording = recordings[index]
                    if (!recording || !recording.solution) {
                        continue // skip message-only levels or levels that do not have a solution
                    }

                    // Some games (like Fish Friend) are a bunch of dialog and do not actually need to run
                    // so if they only contain a "X" then skip them
                    if (recording.solution.replace(/,/g, '').replace(/\./g, '') === 'X') {
                        continue
                    }

                    hasAtLeastOneSolution++

                    if (process.env.CI === 'true' && recording.solution.length > CI_MAX_SOLUTION_LENGTH) {
                        const msg = `CI-SKIP: Solution group: [${moduloNumber}/${moduloTotal}]. Level=${index}. Because the solution is too long: ${recording.solution.length} > ${CI_MAX_SOLUTION_LENGTH}. "${GIST_ID}"` // tslint:disable-line:max-line-length
                        console.log(msg) // tslint:disable-line:no-console
                        continue
                    }

                    if (process.env.CI === 'true' && numPlayed > 0) {
                        break
                    }

                    numPlayed++

                    engine.setLevel(index)

                    // UI.setGame(engine)

                    const DID_NOT_WIN = 'DID_NOT_WIN'
                    let wonAtKeyIndex: number | 'DID_NOT_WIN' = DID_NOT_WIN
                    const keypresses = recording.solution.split('')

                    // Do one tick in the beginning to make sure the sprites are all loaded up
                    await engine.tick()
                    for (let i = 0; i < keypresses.length; i++) {
                        const key = keypresses[i]
                        switch (key) {
                            case 'W': engine.press(INPUT_BUTTON.UP); break
                            case 'S': engine.press(INPUT_BUTTON.DOWN); break
                            case 'A': engine.press(INPUT_BUTTON.LEFT); break
                            case 'D': engine.press(INPUT_BUTTON.RIGHT); break
                            case 'X': engine.press(INPUT_BUTTON.ACTION); break
                            case '.':
                            case ',':
                                break
                            default:
                                throw new Error(`ERROR: Unsupported character "${key}"`)
                        }

                        let didWin = false
                        // do { // loop until we are done with animations
                        const { didLevelChange, didWinGame } = await engine.tick()
                        didWin = didWin || didWinGame || didLevelChange
                        // } while(engine.hasAgain())

                        // if (SHOW_STEPS) {
                        //     UI.renderScreen(false)
                        // }

                        if (didWin) {
                            wonAtKeyIndex = i
                            break
                        }
                    }

                    if (wonAtKeyIndex === DID_NOT_WIN || (wonAtKeyIndex !== keypresses.length - 1)) {
                        // console.error('Screendump of level')
                        // TerminalUI.setGameEngine(engine)
                        // TerminalUI.dumpScreen()
                        // while (engine.canUndo()) {
                        //     engine.pressUndo()
                        //     engine.tick()
                        //     TerminalUI.dumpScreen()
                        // }
                        // UI.setGame(engine)
                        // UI.dumpScreen()
                    }

                    expect({ title: data.title, levelNumber: index, wonAtKeyIndex }).toEqual({ title: data.title, levelNumber: index, wonAtKeyIndex: keypresses.length - 1 })
                }

                if (hasAtLeastOneSolution > 1) {
                    expect(numPlayed).toBeGreaterThanOrEqual(1)
                }

                saveCoverageFile(data, gistFilename, `${GIST_ID}-playgame`)
            })
        })
    })
}
