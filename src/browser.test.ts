/** @jest-environment puppeteer */
/* eslint-env jasmine */
import fs from 'fs'
import path from 'path'
import puppeteer from 'puppeteer' // tslint:disable-line:no-implicit-dependencies
// import mapStackTrace from 'sourcemapped-stacktrace-node')

// Defined via jest-puppeteer environment
declare var page: puppeteer.Page
declare var browser: puppeteer.Browser

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pressKeys(keys: string[]) {
    for (const key of keys) {
        if (key === ',') { continue }
        await page.waitFor(`table[data-ps-accepting-input='true']`)
        if (key === '.') {
            // wait long enough for a tick to occur
            await sleep(100)
            continue
        }
        // await sleep(500/*Math.ceil(1000/60)*/) // enough for requestAnimationFrame to run (60fps)
        await page.keyboard.press(`Key${key}`)
        // wait until the keypress was processed
        await sleep(100)
        // await page.waitFor(`table[data-ps-accepting-input='false']`)
    }
}

// redirect browser console messages to the terminal
const consoleHandler = (message: puppeteer.ConsoleMessage) => {
    const type = message.type()
    const text = message.text()

    switch (type) {
        case 'log': console.log(text); break // tslint:disable-line:no-console
        case 'debug': console.debug(text); break // tslint:disable-line:no-console
        case 'info': console.info(text); break // tslint:disable-line:no-console
        case 'error': console.error(text); break // tslint:disable-line:no-console
        case 'dir': console.dir(text); break // tslint:disable-line:no-console
        case 'dirxml': console.dirxml(text); break // tslint:disable-line:no-console
        case 'table': console.table(text); break // tslint:disable-line:no-console
        case 'trace': console.trace(text); break // tslint:disable-line:no-console
        case 'assert': console.assert(text); break // tslint:disable-line:no-console
        case 'profile': console.profile(text); break // tslint:disable-line:no-console
        case 'profileEnd': console.profileEnd(text); break // tslint:disable-line:no-console
        case 'count': console.count(text); break // tslint:disable-line:no-console
        case 'timeEnd': console.timeEnd(text); break // tslint:disable-line:no-console

        case 'clear': console.clear(); break // tslint:disable-line:no-console
        case 'warning': console.warn(text); break // tslint:disable-line:no-console
        case 'startGroup':
        case 'startGroupCollapsed':
        case 'endGroup':
            console.info(type, text); break // tslint:disable-line:no-console
    }
}

async function evaluateWithStackTrace(fn: puppeteer.EvaluateFn, ...args: any[]) {
    // try {
    return page.evaluate(fn, ...args)
    // } catch (e) {
    //     const stack = e.stack
    //     const message = stack.split('\n')[0]
    //     const newStack = await mapStackTrace(stack, { isChromeOrEdge: true })
    //     console.error(`${message}\n${newStack}`)
    //     e.stack = newStack
    //     throw e
    // }
}

describe('Browser', () => {

    beforeEach(async() => {
        const url = `http://localhost:8000/src/browser/html-table.xhtml`

        // jest-puppeteer will expose the `page` and `browser` globals to Jest tests.
        if (!browser || !page) {
            throw new Error('Browser has not been started! Did you remember to specify `@jest-environment puppeteer`?')
        }

        page.on('console', consoleHandler)

        // page.on('pageerror', async e => {
        //     const newStack = await mapStackTrace(e.message, { isChromeOrEdge: true })
        //     console.error(newStack)
        // })

        await page.goto(url)
    })

    afterEach(() => {
        if (page.off) { // page.off is not a function in Travis
            page.off('console', consoleHandler)
        }
    })

    it('plays a game in the browser', async() => {
        // browser tests are slow. Headless is slower it seems (from jest watch mode)
        jest.setTimeout(process.env.NODE_ENV === 'development' ? 90 * 1000 : 90 * 1000)

        const source = fs.readFileSync(path.join(__dirname, '../gists/_pot-wash-panic_itch/script.txt'), 'utf-8')
        const startLevel = 3

        // This variable is _actually_ defined in the JS file, not here but it is in the body of page.evaluate
        const HackTableStart = (sourceBrowser: string, startLevelBrowser: number) => 'actually implemented in the browser'

        await sleep(500) // wait long enough for the JS to load maybe?
        await evaluateWithStackTrace(({ source, startLevel }) => { // tslint:disable-line:no-shadowed-variable
            if (HackTableStart) {
                if (source && typeof startLevel === 'number') {
                    HackTableStart(source, startLevel)
                } else {
                    throw new Error(`BUG: Source was not a string or startLevel was not a number`)
                }
            } else {
                throw new Error(`BUG: The browser JS does not have HackTableStart defined`)
            }
        }, { source, startLevel })

        return new Promise(async(resolve) => {
            // const dialogHandler = async dialog => {
            //     expect(dialog.message()).toBe('I want to see my face in them! Level 3/14')
            //     await dialog.dismiss()
            //     page.off('dialog', dialogHandler)
            //     resolve()
            // }
            // page.once('dialog', dialogHandler)

            // page.on('dialog', async dialog => {
            //     expect(dialog.message()).toBe('I want to see my face in them! Level 3/14')
            //     await dialog.dismiss()
            //     resolve()
            // })
            await pressKeys('SAAASASDDDWDDDDWDDSAAASASAW'.split(''))
            // await jestPuppeteer.debug()
            resolve()
        })
    })

    // it.skip('Plays an arbitrary game', async () => {
    //     // browser tests are slow. Headless is slower it seems (from jest watch mode)
    //     jest.setTimeout(process.env.NODE_ENV === 'development' ? 10 * 60 * 1000 : 10 * 60 * 1000)

    //     const {page, browser} = await startBrowser()

    //     const source = fs.readFileSync(path.join(__dirname, '../gists/_entanglement/script.txt'), 'utf-8')
    //     const solutions = JSON.parse(fs.readFileSync(path.join(__dirname, '../gist-solutions/_entanglement.json'), 'utf-8'))
    //     const startLevel = 3
    //     const partial = solutions.solutions[startLevel].partial

    //     await sleep(500) // wait for the browser JS to execute
    //     await page.evaluate(({source, startLevel}) => {
    //         window.HackTableStart(source, startLevel)
    //     }, {source, startLevel})

    //     await pressKeys(page, partial.split(''))
    //     await stopBrowser(browser)
    // })
})