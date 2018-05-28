/* eslint-env jasmine */
const { default: Engine } = require('../src/engine')
const { default: Parser } = require('../src/parser/parser')

const SIMPLE_GAME = `
title foo

(verbose_logging)
(debug)

(run_rules_on_level_start)

realtime_interval 0.1


===
OBJECTS
===

background
transparent

one
Darkblue
...0.
..00.
...0.
...0.
..000

zero
Darkblue
..00.
.0..0
.0..0
.0..0
..00.

Player
yellow
00000
0...0
0...0
0...0
00000

===
LEGEND
===

. = background
0 = zero
1 = one
P = Player

====
SOUNDS
====

====
COLLISIONLAYERS
====

background
one
player
zero


====
RULES
====

(
[ stationary Player ] [ stationary 0 ] -> [Player] [ action 1 ]
[ stationary Player ] [ 0 ] -> [Player] [ 1 ]
)
[0] -> [1]



===
WINCONDITIONS
===


===
LEVELS
===

0P

` // End SIMPLE_GAME

const MIRROR_ISLES_CORNERS = `title Mirror Isles corners

========
OBJECTS
========

Background
yellow

Hole
blue

Player
DarkRed #493c2b #000000
..0..
.111.
01110
02220
.2.2.

RemoveLandRUD
Blue
....0
.....
.....
.....
....0

CrateInHole
Brown DarkBrown Blue
20002
01110
01110
01110
20002

=======
LEGEND
=======

. = Background
P = Player
_ = Hole

RemoveLandR = RemoveLandRUD
WaterHere = Hole or CrateInHole

================
COLLISIONLAYERS
================

Background
Player
Hole, CrateInHole
RemoveLandR

======
RULES
======

RIGHT [ NO WaterHere NO RemoveLandR | WaterHere ] -> [ RemoveLandRUD | WaterHere ]

=======
LEVELS
=======

._


` // end game

const MIRROR_ISLES_CORNERS2 = `title Mirror Isles corners2

========
OBJECTS
========

Background
yellow

Hole
blue

Player
DarkRed #493c2b #000000
..0..
.111.
01110
02220
.2.2.

RemoveLandRUD
Blue
....0
.....
.....
.....
....0

RemoveLandRU
Blue
....0
.....
.....
.....
.....

RemoveLandRD
Blue
.....
.....
.....
.....
....0

CrateInHole
Brown DarkBrown Blue
20002
01110
01110
01110
20002

=======
LEGEND
=======

. = Background
P = Player
_ = Hole

RemoveLandR = RemoveLandRUD OR RemoveLandRU OR RemoveLandRD

WaterHere = Hole or CrateInHole

================
COLLISIONLAYERS
================

Background
Player
Hole, CrateInHole
RemoveLandR

======
RULES
======

RIGHT [ NO WaterHere NO RemoveLandR | WaterHere ] -> [ RemoveLandRUD | WaterHere ]
UP [ RemoveLandRUD | NO WaterHere ] -> [ RemoveLandRD | ]
DOWN [ RemoveLandRUD | NO WaterHere ] -> [ RemoveLandRU | ]

=======
LEVELS
=======

._
._


` // end game

const SKIPPING_STONES_CORNERS = `title Skipping Stones corners

========
OBJECTS
========

Background
blue

Sand
yellow

Player
DarkRed #493c2b #000000
..0..
.111.
01110
02220
.2.2.

RemoveLandRUD
Blue
....0
.....
.....
.....
....0

=======
LEGEND
=======

. = Sand
P = Player
_ = Background

RemoveLandR = RemoveLandRUD

================
COLLISIONLAYERS
================

Background
Player
Sand
RemoveLandR

======
RULES
======

RIGHT [ Sand NO RemoveLandR | NO Sand ] -> [ Sand RemoveLandRUD | NO Sand ]

=======
LEVELS
=======

.__


` // end game

const HACK_THE_NET_NODES = `title Hack the net nodes disappearing

========
OBJECTS
========

Background
blue

Player
green

Sand
yellow

Water
Blue

=======
LEGEND
=======

. = Background
s = Sand
P = Player
w = Water
thing = sand OR water

================
COLLISIONLAYERS
================

Background
Player
Sand
Water

======
RULES
======

(no-op)

[ thing ] -> [ thing Player ]

=======
LEVELS
=======

sw


` // end game

function parseEngine (code) {
  const { data, error } = Parser.parse(code)
  expect(error && error.message).toBeFalsy() // Use && so the error messages are shorter

  const engine = new Engine(data)
  engine.setLevel(0)
  return { engine, data }
}

function getSpriteByName (data, name) {
  return data.objects.filter((sprite) => sprite._name === name)[0]
}

describe('engine', () => {
  it('evaluates a simple game', () => {
    const { engine, data } = parseEngine(SIMPLE_GAME)
    const one = data._getSpriteByName('one')
    // const zero = data._getSpriteByName('zero')
    engine.tick()
    expect(engine.toSnapshot()).toMatchSnapshot()
    expect(engine.currentLevel[0][0].getSpritesAsSet()).toContain(one)
  })

  it('draws corner sprites correctly (according to mirror isles)', () => {
    const { engine, data } = parseEngine(MIRROR_ISLES_CORNERS)
    engine.tick()
    expect(engine.toSnapshot()).toMatchSnapshot()
    const expectedSprite = getSpriteByName(data, 'RemoveLandRUD')
    const interestingCell = engine.currentLevel[0][0]
    const sprites = interestingCell.getSpritesAsSet()
    expect(sprites.has(expectedSprite)).toBe(true)

    // Ensure that the CrateInHole does not exist anywhere
    const crateInHole = data._getSpriteByName('CrateInHole')
    expect(crateInHole.getCellsThatMatch().size).toBe(0)
  })

  it('draws corner sprites correctly (according to skipping stones)', () => {
    const { engine, data } = parseEngine(SKIPPING_STONES_CORNERS)
    engine.tick()
    expect(engine.toSnapshot()).toMatchSnapshot()
    const expectedSprite = getSpriteByName(data, 'RemoveLandRUD')
    const interestingCell = engine.currentLevel[0][0]
    const sprites = interestingCell.getSpritesAsSet()
    expect(sprites.has(expectedSprite)).toBe(true)

    engine.tick()
    expect(engine.toSnapshot()).toMatchSnapshot()

    expect(sprites.has(expectedSprite)).toBe(true)
    const neighborCell = engine.currentLevel[0][1]
    const neighborSprites = neighborCell.getSpritesAsSet()
    expect(neighborSprites.has(expectedSprite)).toBe(false)
  })

  it('draws corner sprites correctly according to mirror isles (just the RightUp corner should be blue)', () => {
    const { engine, data } = parseEngine(MIRROR_ISLES_CORNERS2)
    engine.tick()
    const expectedSprite = getSpriteByName(data, 'RemoveLandRU')
    const expectedSprite2 = getSpriteByName(data, 'RemoveLandRD')
    const interestingCell = engine.currentLevel[0][0]
    let sprites = interestingCell.getSpritesAsSet()
    expect(sprites.has(expectedSprite)).toBe(true)
    expect(engine.currentLevel[1][0].getSpritesAsSet().has(expectedSprite2)).toBe(true)

    // Ensure that the CrateInHole does not exist anywhere
    const crateInHole = data._getSpriteByName('CrateInHole')
    expect(crateInHole.getCellsThatMatch().size).toBe(0)
  })

  it('Respects when an OR LegendItem is on the right side of a Rule to preserve the sprite that was there', () => {
    const { engine, data } = parseEngine(HACK_THE_NET_NODES)
    const player = data._getSpriteByName('player')
    const sand = data._getSpriteByName('sand')
    const water = data._getSpriteByName('water')
    engine.tick()

    expect(sand.getCellsThatMatch().size).toBe(1)
    expect(water.getCellsThatMatch().size).toBe(1)
    expect(player.getCellsThatMatch().size).toBe(2)
  })

  it('Runs LATE rules after sprites have moved', () => {
    const { engine, data } = parseEngine(`title Match 3 Block Push

    ========
    OBJECTS
    ========

    Background
    LIGHTGREEN GREEN
    11111
    01111
    11101
    11111
    10111


    Player
    Black Orange White Blue
    .000.
    .111.
    22222
    .333.
    .3.3.

    Crate
    Orange Yellow
    00000
    0...0
    0...0
    0...0
    00000


    =======
    LEGEND
    =======

    . = Background
    P = Player
    * = Crate


    =======
    SOUNDS
    =======

    ================
    COLLISIONLAYERS
    ================

    Background
    Player, Crate

    ======
    RULES
    ======

    ( Put this rule 1st so we know it gets executed AFTER the move occurs)
    LATE [ Crate | Crate | Crate ] -> [ | | ]

    RIGHT [ STATIONARY Player ] -> [ > Player ]

    [ > Player | Crate ] -> [ > Player | > Crate  ]


    ==============
    WINCONDITIONS
    ==============

    All Crate on Target

    =======
    LEVELS
    =======

    ..*
    P*.
    ..*

    `)
    const crate = data._getSpriteByName('crate')
    engine.tick()

    expect(crate.getCellsThatMatch().size).toBe(0)

  })
})
