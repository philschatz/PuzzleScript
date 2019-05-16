#!/usr/bin/env node

const fs = require('fs')
const URL = require('url')
const path = require('path')
const fetch = require('node-fetch')
const mkdirp = require('mkdirp')
const commander = require('commander')
const puppeteer = require('puppeteer')


const URL_REGEXP = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/

commander
.version(require('../package.json').version)
.usage('<url>')
.option('--id <gameId>', 'specify game id to save as')
.parse(process.argv)


function appendCredits(gameId, url) {
    // Append to the credits.md file
    console.log('Appending to credits.md file')
    const creditsPath = path.join(__dirname, '../credits.md')
    let credits = fs.readFileSync(creditsPath, 'utf-8')
    if (credits[credits.length - 1] !== '\n') {
        credits += '\n'
    }
    credits += `- [${gameId}](${url})\n`
    fs.writeFileSync(creditsPath, credits)
}

async function doImport() {
    const browser = await puppeteer.launch({
        devtools: process.env.NODE_ENV === 'development'
    })
    const page = await browser.newPage()

    for (const gameUrl of commander.args) {
        const url = URL.parse(gameUrl, {parseQueryString: true})
        let dirName
        console.log(`Loading ${gameUrl}`)
        if (/puzzlescript\.net/.test(url.hostname)) {
            // It's a puzzlescript game. Just use the GIST query parameter
            const gistId = url.query['p'] || url.query['hack']
            if (!gistId) {
                throw new Error(`Could not determine gist id from the querystring`)
            }
            const response = await fetch(`https://api.github.com/gists/${gistId}`)
            const gist = await response.json()

            dirName = commander.id ? commander.id : `gist-${gistId}`
            const outDir = path.join(__dirname, `../games`, dirName)
            const outFile = path.join(outDir, `script.txt`)

            mkdirp.sync(outDir)
            fs.writeFileSync(outFile, gist["files"]["script.txt"]["content"])
            appendCredits(dirName, gameUrl)
            continue

        } else if (commander.id) {
            dirName = commander.id
        } else if (/itch\.io/.test(url.hostname)) {
            const itchPath = url.pathname.split('/')[1] // since it begins with a '/'
            dirName = `_${url.hostname}_${itchPath}`
        } else {
            throw new Error(`BUG: Unsupported URL. Unsure how to name the game file. Consider passing '--id game-id'`)
        }
        const outDir = path.join(__dirname, `../games`, dirName)
        const outFile = path.join(outDir, `script.txt`)

        const {sourceCode} = await getSourceFromUrl(page, gameUrl)

        mkdirp.sync(outDir)
        fs.writeFileSync(outFile, sourceCode)

        appendCredits(dirName, gameUrl)
    }

    await browser.close()
}

async function getSourceFromUrl(page, gameUrl) {
    await page.goto(gameUrl)
    const {sourceCode, iframeUrl} = await page.evaluate(() => {
        if (window.sourceCode) {
            return {sourceCode: window.sourceCode}
        } else {
            const iframes = document.querySelectorAll('iframe')
            const links = document.querySelectorAll('a[href]')
            if (iframes.length === 1) {
                const iframeUrl = iframes[0].src
                return {iframeUrl}
            } else if (links.length === 1) {
                // follow the link
                return {iframeUrl: links[0].href}
            } else {
                throw new Error(`Could not find the sourceCode or exactly one <iframe>`)
            }
        }
    })

    if (sourceCode) {
        return {sourceCode}
    } else if (iframeUrl) {
        return await getSourceFromUrl(page, iframeUrl)
    } else {
        throw new Error(`ERROR: Could not find sourceCode for ${gameUrl}`)
    }
}

doImport().then(null, err => {
    console.error(err)
    process.exit(111)
})