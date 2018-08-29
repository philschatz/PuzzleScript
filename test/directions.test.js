/* eslint-env jasmine */
const { LevelEngine } = require('../lib/engine')
const { default: Parser } = require('../lib/parser/parser')
const { nextRandom, resetRandomSeed, setRandomValuesForTesting, clearRandomValuesForTesting, getRandomSeed } = require('../lib/util')

function parseEngine(code) {
    const { data, error } = Parser.parse(code)
    expect(error && error.message).toBeFalsy() // Use && so the error messages are shorter

    const engine = new LevelEngine(data)
    engine.setLevel(0)
    return { engine, data }
}

describe('Directions', () => {
    beforeEach(() => {
        clearRandomValuesForTesting()
    })

    it('"randomly" generates integers', () => {
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(3)
        expect(nextRandom(4)).toBe(1)
        expect(nextRandom(4)).toBe(3)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(3)
        expect(nextRandom(4)).toBe(3)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(1)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(0)
        expect(nextRandom(4)).toBe(1)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(0)
        expect(nextRandom(4)).toBe(3)
        expect(nextRandom(4)).toBe(3)
        expect(nextRandom(4)).toBe(0)
        expect(nextRandom(4)).toBe(0)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(1)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(1)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(1)
        expect(nextRandom(4)).toBe(1)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(0)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(1)
        expect(nextRandom(4)).toBe(0)
        expect(nextRandom(4)).toBe(2)
        expect(nextRandom(4)).toBe(1)
        expect(nextRandom(4)).toBe(1)
    })

    it('Marks a sprite when it wants to move', () => {
        const { engine, data } = parseEngine(`
title foo

realtime_interval .01

========
OBJECTS
========

Background
green

Player
blue

=======
LEGEND
=======

. = Background
P = Player

================
COLLISIONLAYERS
================

Background
Player

===
RULES
===

RIGHT [ Player ] -> [ > Player ]

=======
LEVELS
=======

P.

`)

        const player = data._getSpriteByName('player')
        const {changedCells} = engine.tickUpdateCells()
        expect(engine.toSnapshot()).toMatchSnapshot()
        // Once these sprites actually move, we neet to separate engine.tick() into multiple steps:
        // 1. Update all the cells with new sprites and the wantsToMove directions
        // 2. Move all the sprites that want to move
        // 3. Late: Update all the cells with new sprites ...
        // 4. Late: Move all the sprites that want to move
        // next tick for all the AGAIN rules
        expect(engine.currentLevel.getCells()[0][0].getWantsToMove(player)).toBe('RIGHT')

        // Ensure only 1 cell was marked for update
        expect(changedCells.size).toBe(1)
    })

    it('Moves the sprite', () => {
        const { engine, data } = parseEngine(`
title foo

========
OBJECTS
========

Background
green

Player
blue

=======
LEGEND
=======

. = Background
P = Player

================
COLLISIONLAYERS
================

Background
Player

===
RULES
===

RIGHT [ Player ] -> [ > Player ]

=======
LEVELS
=======

P.

`)
        const {changedCells} = engine.tick()
        // expect(engine.toSnapshot()).toMatchSnapshot()
        const player = data._getSpriteByName('player')
        expect(engine.currentLevel.getCells()[0][1].getSpritesAsSet().has(player)).toBe(true)

        // Ensure both cells were marked for re-rendering
        expect(changedCells.size).toBe(2)
        expect(changedCells).toContain(engine.currentLevel.getCells()[0][0])
        expect(changedCells).toContain(engine.currentLevel.getCells()[0][1])
    })

    it('Does not move the sprite if it collides with a sprite in another cell (same collisionlayer)', () => {
        const { engine, data } = parseEngine(`
title foo

========
OBJECTS
========

Background
green

Player
blue

Wall
brown

=======
LEGEND
=======

. = Background
P = Player
W = Wall

================
COLLISIONLAYERS
================

Background
Player, Wall

===
RULES
===

RIGHT [ Player ] -> [ > Player ]

=======
LEVELS
=======

PW

`)
        const {changedCells} = engine.tick()
        // expect(engine.toSnapshot()).toMatchSnapshot()
        const player = data._getSpriteByName('player')
        expect(engine.currentLevel.getCells()[0][1].getSpritesAsSet().has(player)).toBe(false)
        expect(engine.currentLevel.getCells()[0][0].getSpritesAsSet().has(player)).toBe(true)

        // Make sure the wantsToMove flag is cleared
        expect(engine.currentLevel.getCells()[0][0].getWantsToMove(player)).toBe('STATIONARY')

        // nothing actually changed visually
        // expect(changedCells.size).toBe(0)
    })

    it('Does not move the sprite when ACTION is added to it', () => {
        const { engine, data } = parseEngine(`
title foo

========
OBJECTS
========

Background
green

Player
blue

=======
LEGEND
=======

. = Background
P = Player

================
COLLISIONLAYERS
================

Background
Player

===
RULES
===

[ Player ] -> [ ACTION Player ]

=======
LEVELS
=======

P.

`)
        const {changedCells} = engine.tick()
        // expect(engine.toSnapshot()).toMatchSnapshot()
        const player = data._getSpriteByName('player')
        expect(engine.currentLevel.getCells()[0][0].getSpritesAsSet().has(player)).toBe(true)

        // Make sure the wantsToMove flag is cleared
        expect(engine.currentLevel.getCells()[0][0].getWantsToMove(player)).toBe('STATIONARY')

        // nothing actually changed visually
        // expect(changedCells.size).toBe(0)
    })

    it('Randomly decides whether to add the sprite using "RANDOM" in a bracket', () => {
        const { engine, data } = parseEngine(`
title foo

========
OBJECTS
========

Background
green

Player
blue

one
white black
00000
00000
00100
00000
00000

two
white black
00000
01000
00000
00010
00000

three
white black
00000
01000
00100
00010
00000

=======
LEGEND
=======

. = Background
P = Player
DieSide = one OR two OR three

================
COLLISIONLAYERS
================

Background
Player
DieSide

===
RULES
===

(set direction so it is only evaluated once)
LEFT [ Background NO DieSide ] -> [ Background RANDOM DieSide ]

=======
LEVELS
=======

P.

`)
        setRandomValuesForTesting([0, 1])
        const {changedCells} = engine.tick()
        expect(getRandomSeed()).toBe(2 + 1) // Add one because the background sprite was added to the level? (weird)
        // expect(engine.toSnapshot()).toMatchSnapshot()
        const one = data._getSpriteByName('one')
        const two = data._getSpriteByName('two')
        const three = data._getSpriteByName('three')

        // Check that one popped up (because we set the "random" values above)
        // Because the OR is stuck into a set, rather than a list, the 1st item is "three", not "one"
        let threeCells = [...three.getCellsThatMatch()]
        let threeCell = threeCells[0]
        expect(threeCells.length).toBe(1)
        expect(engine.currentLevel.getCells()[0][1].getSpritesAsSet().has(two/*three*/)).toBe(true)
    })

    it('Moves the sprite in a "random" direction using "RANDOMDIR" in a bracket', () => {
        const { engine, data } = parseEngine(`
title foo

========
OBJECTS
========

Background
green

Player
blue

=======
LEGEND
=======

. = Background
P = Player

================
COLLISIONLAYERS
================

Background
Player

===
RULES
===

RIGHT [ Player ] -> [ RANDOMDIR Player ]

=======
LEVELS
=======

.....
.....
..P..
.....
.....

`)
        setRandomValuesForTesting([2, 1])
        const {changedCells} = engine.tick()
        // expect(engine.toSnapshot()).toMatchSnapshot()
        const player = data._getSpriteByName('player')
        expect(engine.currentLevel.getCells()[2][2].getSpritesAsSet().has(player)).toBe(false)
        // Check that the player is around thir previous location
        let playerCells = [...player.getCellsThatMatch()]
        let playerCell = playerCells[0]
        expect(playerCells.length).toBe(1)
        expect(engine.currentLevel.getCells()[playerCell.rowIndex][playerCell.colIndex].getSpritesAsSet().has(player)).toBe(true)

        // Ensure 2 cells were marked for re-rendering
        expect(changedCells.size).toBe(2)
        expect(changedCells).toContain(engine.currentLevel.getCells()[2][2])
        expect(changedCells).toContain(engine.currentLevel.getCells()[playerCell.rowIndex][playerCell.colIndex])

        engine.tick()
        // Check that the player is no longer in the spot they were
        expect(engine.currentLevel.getCells()[playerCell.rowIndex][playerCell.colIndex].getSpritesAsSet().has(player)).toBe(false)
        // Check that the player is around thir previous location
        playerCells = [...player.getCellsThatMatch()]
        playerCell = playerCells[0]
        expect(playerCells.length).toBe(1)
        expect(engine.currentLevel.getCells()[playerCell.rowIndex][playerCell.colIndex].getSpritesAsSet().has(player)).toBe(true)
    })

    it('supports STATIONARY modifier (simple)', () => {
        const { engine, data } = parseEngine(`
    title foo

    ========
    OBJECTS
    ========

    background
    green

    player
    blue

    incorrect
    red

    =======
    LEGEND
    =======

    . = Background
    P = player

    ================
    COLLISIONLAYERS
    ================

    Background
    player
    incorrect

    ===
    RULES
    ===

    RIGHT [ player ] -> [ > player ]
    [ STATIONARY player ] -> [ incorrect ]

    =======
    LEVELS
    =======

    P.

    `)

        const player = data._getSpriteByName('player')
        const incorrect = data._getSpriteByName('incorrect')
        engine.tick()

        let playerCells = [...player.getCellsThatMatch()]
        let playerCell = playerCells[0]
        let incorrectCells = [...incorrect.getCellsThatMatch()]

        expect(incorrectCells.length).toBe(0)

        expect(playerCells.length).toBe(1)
        expect(playerCell.rowIndex).toBe(0)
        expect(playerCell.colIndex).toBe(1)
    })

    it('supports STATIONARY modifier with other sprites that are added', () => {
        const { engine, data } = parseEngine(`
    title foo

    ========
    OBJECTS
    ========

    Background
    green

    player
    blue

    cooldown
    transparent

    =======
    LEGEND
    =======

    . = Background
    P = player

    ================
    COLLISIONLAYERS
    ================

    Background
    player
    cooldown

    ===
    RULES
    ===

    RIGHT [ STATIONARY player NO cooldown ] -> [ > player > cooldown ]

    =======
    LEVELS
    =======

    ...
    .P.
    ...

    `)

        const player = data._getSpriteByName('player')
        const cooldown = data._getSpriteByName('cooldown')
        engine.tick()

        let playerCells = [...player.getCellsThatMatch()]
        let playerCell = playerCells[0]

        expect(player.getCellsThatMatch().size).toBe(1)
        expect(playerCell.rowIndex).toBe(1)
        expect(playerCell.colIndex).toBe(2)
        // Check that there REALLY is only 1 Player sprite
        expect(engine.currentLevel.getCells()[0][1].getSpritesAsSet().has(player)).toBe(false)
        expect(engine.currentLevel.getCells()[1][0].getSpritesAsSet().has(player)).toBe(false)
        expect(engine.currentLevel.getCells()[2][1].getSpritesAsSet().has(player)).toBe(false)
        // Check that the cooldown sprite was also added
        expect(engine.currentLevel.getCells()[1][2].getSpritesAsSet().has(cooldown)).toBe(true)
    })

    it('supports setting STATIONARY so sprites do not move', () => {
        const { engine, data } = parseEngine(`
    title foo

    ========
    OBJECTS
    ========

    Background
    green

    player
    blue

    =======
    LEGEND
    =======

    . = Background
    P = player

    ================
    COLLISIONLAYERS
    ================

    Background
    player

    ===
    RULES
    ===

    RIGHT [ STATIONARY player ] -> [ > player ]
    [ > player ] -> [ STATIONARY player ]

    =======
    LEVELS
    =======

    P.

    `)

        const player = data._getSpriteByName('player')
        engine.tick()

        let playerCells = [...player.getCellsThatMatch()]
        let playerCell = playerCells[0]

        expect(player.getCellsThatMatch().size).toBe(1)
        expect(playerCell.rowIndex).toBe(0)
        expect(playerCell.colIndex).toBe(0)
        // Check that there REALLY is only 1 Player sprite
        expect(engine.currentLevel.getCells()[0][0].getSpritesAsSet().has(player)).toBe(true)
        expect(engine.currentLevel.getCells()[0][1].getSpritesAsSet().has(player)).toBe(false)
    })

    it('puts a top hat on the player (beam islands)', () => {
        const { engine, data } = parseEngine(`
    title foo

    ========
    OBJECTS
    ========

    Background
    green

    player
    yellow

    playertop
    yellow

    =======
    LEGEND
    =======

    . = Background
    P = player

    ================
    COLLISIONLAYERS
    ================

    Background
    player
    playertop

    ===
    RULES
    ===

    UP [ player | ] -> [ player | playertop ]

    =======
    LEVELS
    =======

    .
    P

    `)

        const playerTop = data._getSpriteByName('playertop')
        engine.tick()

        let playerTopCells = [...playerTop.getCellsThatMatch()]
        let playerTopCell = playerTopCells[0]

        expect(playerTop.getCellsThatMatch().size).toBe(1)
        expect(playerTopCell.rowIndex).toBe(0)
        expect(playerTopCell.colIndex).toBe(0)
        // Check that there REALLY is only 1 Player sprite
        expect(engine.currentLevel.getCells()[0][0].getSpritesAsSet().has(playerTop)).toBe(true)
    })

    it('Supports trivial tile negation', () => {
        const { engine, data } = parseEngine(`
    title foo

    ========
    OBJECTS
    ========

    Background
    green

    player
    yellow

    culprit
    transparent

    wrong
    transparent

    correct
    transparent

    =======
    LEGEND
    =======

    . = Background
    Z = culprit

    ================
    COLLISIONLAYERS
    ================

    Background
    player
    culprit
    wrong
    correct

    ===
    RULES
    ===

    [ NO culprit ] -> [ wrong ]
    [ NO player ] -> [ correct ]

    =======
    LEVELS
    =======

    Z

    `)

        const wrong = data._getSpriteByName('wrong')
        const correct = data._getSpriteByName('correct')
        engine.tick()

        expect(wrong.getCellsThatMatch().size).toBe(0)
        expect(correct.getCellsThatMatch().size).toBe(1)
    })

    it('Supports tile negation (slightly more complicated)', () => {
        const { engine, data } = parseEngine(`
    title foo

    =========
    OBJECTS
   =========

   Background
   blue

   Player
   #f7e26b #000000
   01010
   .000.
   .0.0.
   .....
   .....

   temp E
   Transparent yellow
   ....1
   ....1
   ....1
   ....1
   ....1


   wrong
   Transparent red
   1...1
   .1.1.
   ..1..
   .1.1.
   1...1


   ========
    LEGEND
   ========

   @ = Player
   . = background


   ========
    SOUNDS
   ========

   =================
    COLLISIONLAYERS
   =================

   Background
   temp
   wrong
   Player

   =======
    RULES
   =======

   ( Preparation )
   [ Player ] -> [ temp ]

   (This rule is the culprit)
   RIGHT [ NO temp ] -> [ wrong ]

   ===============
    WINCONDITIONS
   ===============

   ========
    LEVELS
   ========

   @

`)

        const wrong = data._getSpriteByName('wrong')
        engine.tick()

        expect(wrong.getCellsThatMatch().size).toBe(0)
    })

    it('Uses the absolute direction when moving a sprite, not the relative one in the rule (e.g. "[ < player ]" )', () => {
        const { engine, data } = parseEngine(`
title foo

========
OBJECTS
========

Background
green

Player
blue

=======
LEGEND
=======

. = Background
P = Player

================
COLLISIONLAYERS
================

Background
Player

===
RULES
===

LEFT [ Player ] -> [ ^ Player ]

=======
LEVELS
=======

P
.

`)
        const {changedCells} = engine.tickUpdateCells()
        // expect(engine.toSnapshot()).toMatchSnapshot()
        const player = data._getSpriteByName('player')
        expect(engine.currentLevel.getCells()[1][0].getSpritesAsSet().has(player)).toBe(false)
        // Check that the player is around thir previous location
        let playerCells = [...player.getCellsThatMatch()]
        let playerCell = playerCells[0]
        expect(playerCells.length).toBe(1)
        expect(engine.currentLevel.getCells()[0][0].getSpritesAsSet().has(player)).toBe(true)
        expect(engine.currentLevel.getCells()[0][0].getWantsToMove(player)).toBe('DOWN')

        engine.tickMoveSprites(changedCells)
        // Check that the player is no longer in the spot they were
        playerCells = [...player.getCellsThatMatch()]
        playerCell = playerCells[0]
        expect(playerCells.length).toBe(1)
        expect(engine.currentLevel.getCells()[1][0].getSpritesAsSet().has(player)).toBe(true)
    })

})
