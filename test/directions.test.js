/* eslint-env jasmine */
const { default: Engine } = require('../src/engine')
const { default: Parser } = require('../src/parser/parser')
const { nextRandom, resetRandomSeed, setRandomValuesForTesting, clearRandomValuesForTesting, getRandomSeed } = require('../src/util')

function parseEngine (code) {
  const { data, error } = Parser.parse(code)
  expect(error && error.message).toBeFalsy() // Use && so the error messages are shorter

  const engine = new Engine(data)
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
    const {engine, data} = parseEngine(`
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

[ Player ] -> [ > Player ]

=======
LEVELS
=======

P.

`)
    const player = data._getSpriteByName('player')
    const changedCellMutations = engine.tickUpdateCells()
    expect(engine.toSnapshot()).toMatchSnapshot()
    // Once these sprites actually move, we neet to separate engine.tick() into multiple steps:
    // 1. Update all the cells with new sprites and the wantsToMove directions
    // 2. Move all the sprites that want to move
    // 3. Late: Update all the cells with new sprites ...
    // 4. Late: Move all the sprites that want to move
    // next tick for all the AGAIN rules
    expect(engine.currentLevel[0][0].getWantsToMove(player)).toBe('RIGHT')

    // Ensure only 1 cell was marked for update
    expect(changedCellMutations.size).toBe(1)
  })

  it('Moves the sprite', () => {
    const {engine, data} = parseEngine(`
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

[ Player ] -> [ > Player ]

=======
LEVELS
=======

P.

`)
    const changedCells = engine.tick()
    // expect(engine.toSnapshot()).toMatchSnapshot()
    const player = data._getSpriteByName('player')
    expect(engine.currentLevel[0][1].getSpritesAsSet().has(player)).toBe(true)

    // Ensure both cells were marked for re-rendering
    expect(changedCells.size).toBe(2)
    expect(changedCells).toContain(engine.currentLevel[0][0])
    expect(changedCells).toContain(engine.currentLevel[0][1])
  })

  it('Does not move the sprite if it collides with a sprite in another cell (same collisionlayer)', () => {
    const {engine, data} = parseEngine(`
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

[ Player ] -> [ > Player ]

=======
LEVELS
=======

PW

`)
    const changedCells = engine.tick()
    // expect(engine.toSnapshot()).toMatchSnapshot()
    const player = data._getSpriteByName('player')
    expect(engine.currentLevel[0][1].getSpritesAsSet().has(player)).toBe(false)
    expect(engine.currentLevel[0][0].getSpritesAsSet().has(player)).toBe(true)

    // Make sure the wantsToMove flag is cleared
    expect(engine.currentLevel[0][0].getWantsToMove(player)).toBeFalsy()

    // nothing actually changed visually
    expect(changedCells.size).toBe(0)
  })

  it('Does not move the sprite when ACTION is added to it', () => {
    const {engine, data} = parseEngine(`
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
    const changedCells = engine.tick()
    // expect(engine.toSnapshot()).toMatchSnapshot()
    const player = data._getSpriteByName('player')
    expect(engine.currentLevel[0][0].getSpritesAsSet().has(player)).toBe(true)

    // Make sure the wantsToMove flag is cleared
    expect(engine.currentLevel[0][0].getWantsToMove(player)).toBeFalsy()

    // nothing actually changed visually
    expect(changedCells.size).toBe(0)
  })

  it('Randomly decides whether to add the sprite using "RANDOM" in a bracket', () => {
    const {engine, data} = parseEngine(`
title foo

========
OBJECTS
========

Background
green

Player
blue

Star
yellow

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

[ Background ] -> [ Background RANDOM Star ]

=======
LEVELS
=======

P.

`)
    setRandomValuesForTesting([0, 1])
    const changedCells = engine.tick()
    console.log('Random seed index is now at', getRandomSeed())
    // expect(engine.toSnapshot()).toMatchSnapshot()
    const star = data._getSpriteByName('star')

    // Check if the star DID NOT "randomly" pop up (because we set the "random" values above)
    let starCells = [...star.getCellsThatMatch()]
    let starCell = starCells[0]
    expect(starCells.length).toBe(0)
    expect(engine.currentLevel[0][1].getSpritesAsSet().has(star)).toBe(false)

    // Ensure 0 cells were marked for re-rendering
    // expect(changedCells.size).toBe(0)
    // Grr, since the RANDOM code was executed (and other sprites could have changed)
    // we err on the side of caution and report the Cell as having been changed even though it
    // might not have.

    engine.tick()
    // Check if the star "randomly" popped up
    starCells = [...star.getCellsThatMatch()]
    starCell = starCells[0]
    expect(starCells.length).toBe(1)
    expect(engine.currentLevel[0][1].getSpritesAsSet().has(star)).toBe(true)

    // // Ensure 1 cells were marked for re-rendering
    // expect(changedCells.size).toBe(1)
    // expect(changedCells).toContain(engine.currentLevel[0][1])
    // expect(changedCells).toContain(engine.currentLevel[0][1])
  })

  it('Moves the sprite in a "random" direction using "RANDOMDIR" in a bracket', () => {
    const {engine, data} = parseEngine(`
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

[ Player ] -> [ RANDOMDIR Player ]

=======
LEVELS
=======

.....
.....
..P..
.....
.....

`)
    // setRandomValuesForTesting([0])
    const changedCells = engine.tick()
    // expect(engine.toSnapshot()).toMatchSnapshot()
    const player = data._getSpriteByName('player')
    expect(engine.currentLevel[2][2].getSpritesAsSet().has(player)).toBe(false)
    // Check that the player is around thir previous location
    let playerCells = [...player.getCellsThatMatch()]
    let playerCell = playerCells[0]
    expect(playerCells.length).toBe(1)
    expect(engine.currentLevel[playerCell.rowIndex][playerCell.colIndex].getSpritesAsSet().has(player)).toBe(true)

    // Ensure 2 cells were marked for re-rendering
    expect(changedCells.size).toBe(2)
    expect(changedCells).toContain(engine.currentLevel[2][2])
    expect(changedCells).toContain(engine.currentLevel[playerCell.rowIndex][playerCell.colIndex])

    engine.tick()
    // Check that the player is no longer in the spot they were
    expect(engine.currentLevel[playerCell.rowIndex][playerCell.colIndex].getSpritesAsSet().has(player)).toBe(false)
    // Check that the player is around thir previous location
    playerCells = [...player.getCellsThatMatch()]
    playerCell = playerCells[0]
    expect(playerCells.length).toBe(1)
    expect(engine.currentLevel[playerCell.rowIndex][playerCell.colIndex].getSpritesAsSet().has(player)).toBe(true)
  })

  it('supports STATIONARY modifier (simple)', () => {
    const {engine, data} = parseEngine(`
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

    ===
    RULES
    ===

    [ player ] -> [ > player ]
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
    const {engine, data} = parseEngine(`
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

    ([ cooldown ] -> [ ])
    ([ > player NO cooldown ] -> [ STATIONARY player cooldown ])
    [ STATIONARY player NO cooldown ] -> [ > player > cooldown ]

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
    expect(engine.currentLevel[0][1].getSpritesAsSet().has(player)).toBe(false)
    expect(engine.currentLevel[1][0].getSpritesAsSet().has(player)).toBe(false)
    expect(engine.currentLevel[2][1].getSpritesAsSet().has(player)).toBe(false)
    // Check that the cooldown sprite was also added
    expect(engine.currentLevel[1][2].getSpritesAsSet().has(cooldown)).toBe(true)
  })

  it('puts a top hat on the player (beam islands)', () => {
    const {engine, data} = parseEngine(`
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
    expect(engine.currentLevel[0][0].getSpritesAsSet().has(playerTop)).toBe(true)
  })
})
