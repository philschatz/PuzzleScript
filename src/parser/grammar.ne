# This file is a https://github.com/kach/nearley file and it generates the ./grammar.ts file
# The type of AST generated is `IASTGame` (see ./astTypes.ts)
@preprocessor typescript
@{%
// tslint:disable
// Disable all linting because the file is autogenerated (& out of our control)
import * as ast from './astTypes'
const debugBlackList = new Set<string>([])
const debugWhiteList = new Set<string>([])

const toDebug = (name: string, fn?: (fields: any[]) => any) => {
    if (process.env.NODE_ENV == 'debug-parser' || debugWhiteList.has(name)) {
        // Skip debug mode for any items on the blacklist
        if (debugBlackList.has(name)) {
            return null
        }
        // return either the custom function provided, or the default one for debugging
        return fn || function (args) {
            return {type: name, args: args}
        }
    } else {
        return null // use the non-debug function
    }
}

const nuller = (a: any) => null
// const debugRule = (msg) => (a) => { debugger; console.log(msg, a); return a }
const concatChars = ([a]: string[][]) => a.join('')
const extractFirst = <T>(ary: T[][]) => ary.map(subArray => {
    if (subArray.length !== 1) {
        throw new Error(`BUG: Expected items to only have one element (usually used in listOf[...])`)
    } else {
        return subArray[0]
    }
})
const extractSecond = <T>(ary: T[][]) => ary.map(subArray => {
    if (subArray.length < 2) {
        throw new Error(`BUG: Expected items to have at least 2 elements (usually used in listOf[...])`)
    } else {
        return subArray[1]
    }
})
const extractThird = <T>(ary: T[][]) => ary.map(subArray => {
    if (subArray.length < 3) {
        throw new Error(`BUG: Expected items to have at least 3 elements (usually used in listOf[...])`)
    } else {
        return subArray[2]
    }
})

function nonemptyListOf<T>([first, rest]: any[]/*[T, T[][]]*/) {
    const f = first as T
    const r = rest as T[][]
    return [f].concat(r.map(([_1, child]) => child))
}
const upperId = ([id]: string[]) => id.toUpperCase()

const TILE_MODIFIERS = new Set([
    '...', // This one isn't a modifier but we do not allow it so that we match ellipsis rules in a different rule
    'AGAIN', // This is another hack. Some people write `[]->[AGAIN]` rather than `[]->[]AGAIN`
    'DEBUGGER', // Another hack. Ensure that this is not accidentally used as a tile name
    'NO',
    'LEFT',
    'RIGHT',
    'UP',
    'DOWN',
    'RANDOMDIR',
    'RANDOM',
    'STATIONARY',
    'MOVING',
    'ACTION',
    'VERTICAL',
    'HORIZONTAL',
    'PERPENDICULAR',
    'PARALLEL',
    'ORTHOGONAL',
    '^',
    '<',
    '>',
    'V',
])

%}

# Configure the lexer:
# @lexer lexer
# @builtin "whitespace.ne"

atLeast2ListOf[Child, Separator] -> $Child ($Separator $Child):+      {% toDebug('atLeast2ListOf') || nonemptyListOf %}
nonemptyListOf[Child, Separator] -> $Child ($Separator $Child):*      {% toDebug('nonemptyListOf') || nonemptyListOf %}

# ================
# SECTION_NAME
# ================
Section[Name, ItemExpr] ->
    _ "=":+ lineTerminator
    _ $Name lineTerminator
    _ "=":+ lineTerminator:+
    ($ItemExpr):*           {% toDebug('Section', function ([_0, _1, _2, _3, name, _5, _6, _7, _8, items]) { return {type: 'SECTION', name: name, items: extractFirst(extractFirst(items)) } }) ||
                                                  function ([_0, _1, _2, _3, name, _5, _6, _7, _8, items]) { return extractFirst(extractFirst(items)) } %}

# Levels start with multiple linebreaks to handle end-of-file case when we don't have 2 linefeeds
# So we need to remove linefeeds from the section to remove ambiguity
SectionSingleTerminator[Name, ItemExpr] ->
    _ "=":+ lineTerminator
    _ $Name lineTerminator
    _ "=":+ lineTerminator
    ($ItemExpr):*           {% toDebug('Section', function ([_0, _1, _2, _3, name, _5, _6, _7, _8, items]) { return {type: 'SECTION', name: name, items: extractFirst(extractFirst(items)) } }) ||
                                                  function ([_0, _1, _2, _3, name, _5, _6, _7, _8, items]) { return extractFirst(extractFirst(items)) } %}


main ->
    lineTerminator:* # Version information
    _ Title lineTerminator:+
    OptionalMetaData
    Section[t_OBJECTS, Sprite]:?
    Section[t_LEGEND, LegendTile]:?
    Section[t_SOUNDS, SoundItem]:?
    Section[t_COLLISIONLAYERS, CollisionLayerItem]:?
    Section[t_RULES, RuleItem]:?
    Section[t_WINCONDITIONS, WinConditionItem]:?
    SectionSingleTerminator[t_LEVELS, LevelItem]:? {% toDebug('Section') ||
        function([_0, _1, title, _2, metadata, sprites, legendItems, sounds, collisionLayers, rules, winConditions, levelsAsSingleArray]) {
            const levels = []
            let currentMapLevel = null
            for (const levelRowItem of levelsAsSingleArray || []) {
                switch (levelRowItem.type) {
                    case 'LEVEL_ROW':
                        if (currentMapLevel) {
                            currentMapLevel.push(levelRowItem)
                        } else {
                            currentMapLevel = [levelRowItem]
                        }
                        break
                    case 'LEVEL_MESSAGE':
                        if (currentMapLevel) {
                            levels.push({type: 'LEVEL_MAP', cells: currentMapLevel.map(row => row.cells), _sourceOffset: currentMapLevel[0]._sourceOffset})
                            currentMapLevel = null
                        }
                        levels.push(levelRowItem)
                        break
                    case 'LEVEL_SEPARATOR':
                        if (currentMapLevel) {
                            levels.push({type: 'LEVEL_MAP', cells: currentMapLevel.map(row => row.cells), _sourceOffset: currentMapLevel[0]._sourceOffset})
                            currentMapLevel = null
                        }
                        break
                    default:
                        throw new Error(`BUG: Unsupported level row type "${levelRowItem.type}"`)
                }
            }
            // add the last level
            if (currentMapLevel) {
                levels.push({type: 'LEVEL_MAP', cells: currentMapLevel.map(row => row.cells), _sourceOffset: currentMapLevel[0]._sourceOffset})
                currentMapLevel = null
            }
            return {
                title: title.value,
                metadata: metadata.value,
                sprites: sprites || [],
                legendItems: legendItems || [],
                sounds: sounds || [],
                collisionLayers: collisionLayers || [],
                rules: rules || [],
                winConditions: winConditions || [],
                levels: levels
            }
        }
    %}


_ -> ( whitespaceChar | multiLineComment ):*    {% toDebug('whitespace') || nuller %}
__ -> ( whitespaceChar | multiLineComment ):+   {% toDebug('whitespace') || nuller %}

multiLineComment -> "(" textOrComment:* ")"     {% toDebug('multiLineComment') || nuller %}
textOrComment ->
      multiLineComment      {% nuller %}
    | [^\(\)]               {% nuller %}


whitespaceChar -> " " | "\t" # tab
newline -> "\n"
digit -> [0-9]          {% id %}
hexDigit -> [0-9a-fA-F] {% id %}
letter -> [^\n \(\)]    {% id %}

integer -> digit:+      {% ([chars]) => parseInt(chars.join(''), 10) %}
word -> [^\n \(]:+      {% toDebug('WORD') || concatChars %}

words -> nonemptyListOf[word, whitespaceChar:+] {% toDebug('WORDS') || function ([a]) { return extractFirst(a).join(' ') } %}

lineTerminator -> _ newline {% toDebug('lineTerminator') || nuller %}
sourceCharacter -> [^\n ]

nonVarChar -> whitespaceChar | newline | "[" | "]" | "(" | ")" | "|" | "."



decimal ->
    decimalWithLeadingNumber
    | decimalWithLeadingPeriod
decimalWithLeadingNumber -> digit:+ ("." digit:+):?     {% ([firstDigit, rest]) => {
    if (rest) {
        return Number.parseFloat(`${firstDigit[0]}.${rest[1].join('')}`)
    } else {
        return Number.parseInt(firstDigit[0], 10)
    }
} %}
decimalWithLeadingPeriod -> "." digit:+                 {% ([_1, digits]) => { return Number.parseInt(digits.join(''), 10) } %}

colorHex6 -> "#" hexDigit hexDigit hexDigit hexDigit hexDigit hexDigit  {% (a, _sourceOffset) => { return {type:ast.COLOR_TYPE.HEX6, value: a.join(''), _sourceOffset} } %}
colorHex3 -> "#" hexDigit hexDigit hexDigit                             {% (a, _sourceOffset) => { return {type:ast.COLOR_TYPE.HEX3, value: a.join(''), _sourceOffset} } %}
colorNameOrHex ->
      colorHex6 {% id %}
    | colorHex3 {% id %}
    | colorName {% id %}
# Exclude `#` to ensure it does not conflict with the hex colors
# Exclude 0-9 because those are pixel colors
colorName -> [^\n #\(0-9\.] word {% toDebug('COLOR_NAME') || function ([first, rest], _sourceOffset) { return {type:ast.COLOR_TYPE.NAME, value: [first].concat(rest).join(''), _sourceOffset} } %}


# ----------------
# Variable Names
# ----------------

# There are 2 classes of restrictions on variable names:
# - in a Level. object shortcut characters, legend items : These cannot contain the character "="
# - in Rules. object names, rule references, some legend items : These cannot contain characters like brackets and pipes because they can occur inside a Rule

legendVariableChar -> [^\n\ \=] # -> (~__ ~newline ~"=" %any)
# Disallow:
# __ [ ] | t_ELLIPSIS   because it can occur inside a Rule
# "=" because it can occur inside a legend Variable
ruleVariableChar -> [^(?=\.\.\.)\n \=\[\]\|] # -> (~__ ~newline ~"=" ~"[" ~"]" ~"|" ~t_ELLIPSIS %any)

ruleVariableName -> ruleVariableChar:+  {% concatChars %} # -> %ruleVariableChar:+
lookupRuleVariableName -> [^\n \=\[\]\|]:+ {% ([a], offset, reject) => {
  const str = a.join('')
  if (TILE_MODIFIERS.has(str.toUpperCase())) {
    return reject
  } else {
    return str
  }
} %} # -> ~t_AGAIN ruleVariableName # added t_AGAIN to parse '... -] [ tilename AGAIN ]' (it should be a command)

# Disallow:
# __ [ ] | t_ELLIPSIS   because it can occur inside a Rule
# "," because it can occur inside a CollisionLayer
# "=" because it can occur inside a legend Variable
collisionVariableChar -> [^(?=\.\.\.)\ \n\=\[\]\|\,] # -> (~__ ~newline ~"=" ~"[" ~"]" ~"|" ~"," ~t_ELLIPSIS %any)
collisionVariableName -> collisionVariableChar:+ {% concatChars %}
lookupCollisionVariableName -> collisionVariableName {% id %}


# special flag that can appear before rules so the debugger pauses before the rule is evaluated
t_DEBUGGER ->
      t_DEBUGGER_ADD {% id %}
    | t_DEBUGGER_REMOVE {% id %}
    | t_DEBUGGER_DEFAULT {% id %}
t_DEBUGGER_DEFAULT -> "DEBUGGER"i {% upperId %}
t_DEBUGGER_ADD -> "DEBUGGER_ADD"i {% upperId %}
t_DEBUGGER_REMOVE -> "DEBUGGER_REMOVE"i {% upperId %}


# Section titles
t_OBJECTS -> "OBJECTS"i {% upperId %}
t_LEGEND -> "LEGEND"i {% upperId %}
t_SOUNDS -> "SOUNDS"i {% upperId %}
t_COLLISIONLAYERS -> "COLLISIONLAYERS"i {% upperId %}
t_RULES -> "RULES"i {% upperId %}
t_WINCONDITIONS -> "WINCONDITIONS"i {% upperId %}
t_LEVELS -> "LEVELS"i {% upperId %}

# Modifier tokens
t_RIGID -> "RIGID"i {% upperId %}
t_LATE -> "LATE"i {% upperId %}
t_RANDOM -> "RANDOM"i {% upperId %}
t_RANDOMDIR -> "RANDOMDIR"i {% upperId %}
t_ACTION -> "ACTION"i {% upperId %}
t_STARTLOOP -> "STARTLOOP"i {% upperId %}
t_ENDLOOP -> "ENDLOOP"i {% upperId %}

# Movement tokens
t_UP -> "UP"i {% upperId %}
t_DOWN -> "DOWN"i {% upperId %}
t_LEFT -> "LEFT"i {% upperId %}
t_RIGHT -> "RIGHT"i {% upperId %}
t_ARROW_UP -> "^"i {% upperId %}
t_ARROW_DOWN -> "V"i {% upperId %}
t_ARROW_LEFT -> "<"i {% upperId %}
t_ARROW_RIGHT -> ">"i {% upperId %}
t_MOVING -> "MOVING"i {% upperId %}
t_ORTHOGONAL -> "ORTHOGONAL"i {% upperId %}
t_PERPENDICULAR -> "PERPENDICULAR"i {% upperId %}
t_PARALLEL -> "PARALLEL"i {% upperId %}
t_STATIONARY -> "STATIONARY"i {% upperId %}
t_HORIZONTAL -> "HORIZONTAL"i {% upperId %}
t_VERTICAL -> "VERTICAL"i {% upperId %}

t_ARROW_ANY -> t_ARROW_UP {% upperId %}
    | t_ARROW_DOWN {% upperId %} # Because of this, "v" can never be an Object or Legend variable. TODO: Ensure "v" is never an Object or Legend variable
    | t_ARROW_LEFT {% upperId %}
    | t_ARROW_RIGHT {% upperId %}

# Command tokens
t_AGAIN -> "AGAIN"i {% upperId %}
t_CANCEL -> "CANCEL"i {% upperId %}
t_CHECKPOINT -> "CHECKPOINT"i {% upperId %}
t_RESTART -> "RESTART"i {% upperId %}
t_UNDO -> "UNDO"i {% upperId %}
t_WIN -> "WIN"i {% upperId %}
t_MESSAGE -> "MESSAGE"i {% upperId %}

t_ELLIPSIS -> "..."i {% upperId %}

# LEGEND tokens
t_AND -> "AND"i {% upperId %}
t_OR -> "OR"i {% upperId %}

# SOUND tokens
t_SFX0 -> "SFX0"i {% upperId %}
t_SFX1 -> "SFX1"i {% upperId %}
t_SFX2 -> "SFX2"i {% upperId %}
t_SFX3 -> "SFX3"i {% upperId %}
t_SFX4 -> "SFX4"i {% upperId %}
t_SFX5 -> "SFX5"i {% upperId %}
t_SFX6 -> "SFX6"i {% upperId %}
t_SFX7 -> "SFX7"i {% upperId %}
t_SFX8 -> "SFX8"i {% upperId %}
t_SFX9 -> "SFX9"i {% upperId %}
t_SFX10 -> "SFX10"i {% upperId %}
t_SFX ->
      t_SFX10 {% upperId %} # needs to go 1st because of t_SFX1
    | t_SFX0 {% upperId %}
    | t_SFX1 {% upperId %}
    | t_SFX2 {% upperId %}
    | t_SFX3 {% upperId %}
    | t_SFX4 {% upperId %}
    | t_SFX5 {% upperId %}
    | t_SFX6 {% upperId %}
    | t_SFX7 {% upperId %}
    | t_SFX8 {% upperId %}
    | t_SFX9 {% upperId %}

# METADATA Tokens
t_TITLE -> "TITLE"i {% upperId %}
t_AUTHOR -> "AUTHOR"i {% upperId %}
t_HOMEPAGE -> "HOMEPAGE"i {% upperId %}
t_YOUTUBE -> "YOUTUBE"i {% upperId %}
t_ZOOMSCREEN -> "ZOOMSCREEN"i {% upperId %}
t_FLICKSCREEN -> "FLICKSCREEN"i {% upperId %}
t_REQUIRE_PLAYER_MOVEMENT -> "REQUIRE_PLAYER_MOVEMENT"i {% upperId %}
t_RUN_RULES_ON_LEVEL_START -> "RUN_RULES_ON_LEVEL_START"i {% upperId %}
t_COLOR_PALETTE -> "COLOR_PALETTE"i {% upperId %}
t_BACKGROUND_COLOR -> "BACKGROUND_COLOR"i {% upperId %}
t_TEXT_COLOR -> "TEXT_COLOR"i {% upperId %}
t_REALTIME_INTERVAL -> "REALTIME_INTERVAL"i {% upperId %}
t_KEY_REPEAT_INTERVAL -> "KEY_REPEAT_INTERVAL"i {% upperId %}
t_AGAIN_INTERVAL -> "AGAIN_INTERVAL"i {% upperId %}

# These settings do not have a value so they need to be parsed slightly differently
t_NOACTION -> "NOACTION"i {% upperId %}
t_NOUNDO -> "NOUNDO"i {% upperId %}
t_NORESTART -> "NORESTART"i {% upperId %}
t_THROTTLE_MOVEMENT -> "THROTTLE_MOVEMENT"i {% upperId %}
t_NOREPEAT_ACTION -> "NOREPEAT_ACTION"i {% upperId %}
t_VERBOSE_LOGGING -> "VERBOSE_LOGGING"i {% upperId %}


t_TRANSPARENT -> "TRANSPARENT"i {% upperId %}

t_MOVE -> "MOVE"i {% upperId %}
t_DESTROY -> "DESTROY"i {% upperId %}
t_CREATE -> "CREATE"i {% upperId %}
t_CANTMOVE -> "CANTMOVE"i {% upperId %}

t_TITLESCREEN -> "TITLESCREEN"i {% upperId %}
t_STARTGAME -> "STARTGAME"i {% upperId %}
t_STARTLEVEL -> "STARTLEVEL"i {% upperId %}
t_ENDLEVEL -> "ENDLEVEL"i {% upperId %}
t_ENDGAME -> "ENDGAME"i {% upperId %}
t_SHOWMESSAGE -> "SHOWMESSAGE"i {% upperId %}
t_CLOSEMESSAGE -> "CLOSEMESSAGE"i {% upperId %}

t_GROUP_RULE_PLUS -> "+"i {% upperId %}

# WINCONDITIONS tokens
t_ON -> "ON"i {% upperId %}
t_NO -> "NO"i {% upperId %}
t_ALL -> "ALL"i {% upperId %}
t_ANY -> "ANY"i {% upperId %}
t_SOME -> "SOME"i {% upperId %}


Title -> t_TITLE __ words          {% ([_1, _2, value], _sourceOffset) => { return {type:'TITLE', value, _sourceOffset} } %}

OptionalMetaData -> (_ OptionalMetaDataItem lineTerminator:+):*     {% ([vals]) => { return {type: 'METADATA', value: extractSecond(vals)} } %}

OptionalMetaDataItem ->
      t_AUTHOR __ words                         {% ([_1, _2, value], _sourceOffset) => { return {type:'AUTHOR', value, _sourceOffset} } %}
    | t_HOMEPAGE __ word                        {% ([_1, _2, value], _sourceOffset) => { return {type:'HOMEPAGE', value, _sourceOffset} } %}
    | t_YOUTUBE __ word                         {% ([_1, _2, value], _sourceOffset) => { return {type:'YOUTUBE', value, _sourceOffset} } %}
    | t_ZOOMSCREEN __ widthAndHeight            {% ([_1, _2, value], _sourceOffset) => { return {type:'ZOOMSCREEN', value, _sourceOffset} } %}
    | t_FLICKSCREEN __ widthAndHeight           {% ([_1, _2, value], _sourceOffset) => { return {type:'FLICKSCREEN', value, _sourceOffset} } %}
    | t_REQUIRE_PLAYER_MOVEMENT (__ "off"):?    {% ([_1, _2, value], _sourceOffset) => { return {type:'REQUIRE_PLAYER_MOVEMENT', value: !!value, _sourceOffset} } %}
    | t_RUN_RULES_ON_LEVEL_START (__ "true"):?  {% ([_1, _2, value], _sourceOffset) => { return {type:'RUN_RULES_ON_LEVEL_START', value: true, _sourceOffset} } %}
    | t_COLOR_PALETTE __ word                   {% ([_1, _2, value], _sourceOffset) => { return {type:'COLOR_PALETTE', value, _sourceOffset} } %}
    | t_BACKGROUND_COLOR __ colorNameOrHex      {% ([_1, _2, value], _sourceOffset) => { return {type:'BACKGROUND_COLOR', value, _sourceOffset} } %}
    | t_TEXT_COLOR __ colorNameOrHex            {% ([_1, _2, value], _sourceOffset) => { return {type:'TEXT_COLOR', value, _sourceOffset} } %}
    | t_REALTIME_INTERVAL __ decimal            {% ([_1, _2, value], _sourceOffset) => { return {type:'REALTIME_INTERVAL', value, _sourceOffset} } %}
    | t_KEY_REPEAT_INTERVAL __ decimal          {% ([_1, _2, value], _sourceOffset) => { return {type:'KEY_REPEAT_INTERVAL', value, _sourceOffset} } %}
    | t_AGAIN_INTERVAL __ decimal               {% ([_1, _2, value], _sourceOffset) => { return {type:'AGAIN_INTERVAL', value, _sourceOffset} } %}
    | t_NOACTION                                {% () => { return {type:'NOACTION', value: true} } %}
    | t_NOUNDO                                  {% () => { return {type:'NOUNDO', value: true} } %}
    | t_NOREPEAT_ACTION                         {% () => { return {type:'NOREPEAT_ACTION', value: true} } %}
    | t_THROTTLE_MOVEMENT                       {% () => { return {type:'THROTTLE_MOVEMENT', value: true} } %}
    | t_NORESTART                               {% () => { return {type:'NORESTART', value: true} } %}
    | t_VERBOSE_LOGGING                         {% () => { return {type:'VERBOSE_LOGGING', value: true} } %}


widthAndHeight -> integer "x" integer   {% ([width, _1, height]) => { return {type: 'WIDTH_AND_HEIGHT', width, height} } %}


Sprite ->
      SpritePixels      {% id %}
    | SpriteNoPixels    {% id %}

SpriteNoPixels ->
    _ spriteName (__ legendShortcutChar):? lineTerminator:+ # Some sprites have their colors commented out so we need more than one newline
    _ colorDefinitions lineTerminator:+ {% toDebug('SpriteNoPixels') || function ([_0, name, mapCharOpt, _2, _3, colors, _5], _sourceOffset) { return {type: ast.SPRITE_TYPE.NO_PIXELS, name: name, mapChar: mapCharOpt ? mapCharOpt[1] : null, colors, _sourceOffset} } %}

SpritePixels ->
    _ spriteName (__ legendShortcutChar):? lineTerminator:+ # Some sprites have their colors commented out so we need more than one newline
    _ colorDefinitions lineTerminator:+
    PixelRows
    lineTerminator:*                     {% toDebug('SpritePixels') || function ([_0, name, mapCharOpt, _2, _3, colors, _5, pixels, _7], _sourceOffset) { return {type: ast.SPRITE_TYPE.WITH_PIXELS, name: name, mapChar: mapCharOpt ? mapCharOpt[1] : null, colors, pixels, _sourceOffset} } %}

colorDefinitions ->
      nonemptyListOf[colorNameOrHex, __] {% ([a]) => extractFirst(a) %}
    # Some games just have `#123456#789abc #def012` (no space before the next hex number)
    | nonemptyListOf[colorHex6, __] nonemptyListOf[colorHex6, __]  {% ([a, b]) => extractFirst(a.concat(b)) %}


spriteName -> ruleVariableName              {% id %}
pixelRow -> _ pixelDigit:+ lineTerminator   {% toDebug('pixelRow', function ([_0, entries, _2]) { return {type: 'PIXEL_ROW', entries: entries} }) || function ([_0, entries, _2]) { return entries } %}
pixelDigit ->
      digit {% id %}
    | "."   {% id %}
legendShortcutChar -> [^\n ] {% id %}

# Support at least 5x5 sprites (so we can disambiguate from single-color definitions)
PixelRows -> pixelRow pixelRow pixelRow pixelRow pixelRow:+     {% ([r1, r2, r3, r4, rest]) => [r1, r2, r3, r4].concat(rest) %}


LegendTile ->
      LegendTileSimple {% id %}
    | LegendTileAnd    {% id %}
    | LegendTileOr     {% id %}

LegendTileSimple -> _ LegendVarNameDefn _ "=" _ LookupLegendVarName lineTerminator:+                                {% toDebug('LegendTileSimple') || function([_0, name, _2, _3, _4, tile, _6, _7], _sourceOffset) { return {type: ast.TILE_TYPE.SIMPLE, name, tile, _sourceOffset} } %}
# Ensure there are spaces around AND or OR so we do not accidentally match CleANDishes
LegendTileAnd ->    _ LegendVarNameDefn _ "=" _ atLeast2ListOf[LookupLegendVarName, __ t_AND __] lineTerminator:+   {% toDebug('LegendTileAnd') || function([_0, name, _2, _3, _4, tiles, _6, _7], _sourceOffset) { return {type: ast.TILE_TYPE.AND, name, tiles: extractFirst(tiles), _sourceOffset} } %}
LegendTileOr ->     _ LegendVarNameDefn _ "=" _ atLeast2ListOf[LookupLegendVarName, __ t_OR __] lineTerminator:+    {% toDebug('LegendTileOr')  || function([_0, name, _2, _3, _4, tiles, _6, _7], _sourceOffset) { return {type: ast.TILE_TYPE.OR, name, tiles: extractFirst(tiles), _sourceOffset} } %}

LegendVarNameDefn -> word {% toDebug('LegendVarNameDefn') || id %}
    # # If it is multiple characters then it needs to be a valid ruleVariableName. If it is one character then it needs to be a valid legendVariableChar
    #   (ruleVariableChar ruleVariableName) {% debugRule('aksjhdakjshdasd') %}
    # | legendVariableChar                  {% debugRule('OIUOIUOIU') %}

LookupLegendVarName -> LegendVarNameDefn {% toDebug('LookupLegendVarName') || id %}


# TODO: Handle tokens like sfx0 and explicit args instead of just varName (like "Player CantMove up")
# all of them are at https:#www.puzzlescript.net/Documentation/sounds.html
SoundItem -> _ SoundItemInner lineTerminator:+      {% ([_0, sound, _2]) => sound %}

SoundItemInner ->
      SoundItemEnum             {% id %}
    | SoundItemSfx              {% id %}
    | SoundItemMoveDirection    {% id %}
    | SoundItemMoveSimple       {% id %}
    | SoundItemNormal           {% id %}

soundItemSimpleOptions ->
      t_RESTART         {% upperId %}
    | t_UNDO            {% upperId %}
    | t_TITLESCREEN     {% upperId %}
    | t_STARTGAME       {% upperId %}
    | t_STARTLEVEL      {% upperId %}
    | t_ENDLEVEL        {% upperId %}
    | t_ENDGAME         {% upperId %}
    | t_SHOWMESSAGE     {% upperId %}
    | t_CLOSEMESSAGE    {% upperId %}

SoundItemEnum -> soundItemSimpleOptions __ integer      {% ([when, _1, soundCode], _sourceOffset) => { return {type: ast.SOUND_TYPE.WHEN, when, soundCode, _sourceOffset} } %}
SoundItemSfx -> t_SFX __ integer                        {% ([soundEffect, _1, soundCode], _sourceOffset) => { return {type: ast.SOUND_TYPE.SFX, soundEffect, soundCode, _sourceOffset} } %}
SoundItemMoveDirection -> lookupRuleVariableName __ t_MOVE __ soundItemActionMoveArg __ integer     {% ([sprite, _1, _2, _3, direction, _5, soundCode], _sourceOffset) => { return {type: ast.SOUND_TYPE.SPRITE_DIRECTION, sprite, direction, soundCode, _sourceOffset} } %}
SoundItemMoveSimple -> lookupRuleVariableName __ t_MOVE __ integer  {% ([sprite, _1, _2, _3, soundCode], _sourceOffset) => { return {type: ast.SOUND_TYPE.SPRITE_MOVE, sprite, soundCode, _sourceOffset} } %}
SoundItemNormal -> lookupRuleVariableName __ SoundItemAction __ integer     {% ([sprite, _1, eventEnum, _3, soundCode], _sourceOffset) => { return {type: ast.SOUND_TYPE.SPRITE_EVENT, sprite, eventEnum, soundCode, _sourceOffset} } %}

SoundItemAction ->
      t_CREATE      {% upperId %}
    | t_DESTROY     {% upperId %}
    | t_CANTMOVE    {% upperId %}

soundItemActionMoveArg ->
      t_UP          {% upperId %}
    | t_DOWN        {% upperId %}
    | t_LEFT        {% upperId %}
    | t_RIGHT       {% upperId %}
    | t_HORIZONTAL  {% upperId %}
    | t_VERTICAL    {% upperId %}

# collision layers are separated by a space or a comma (and some games and with a comma)
CollisionLayerItem -> _ nonemptyListOf[lookupCollisionVariableName, (_ "," _ | __)] ",":? lineTerminator:+      {% toDebug('CollisionLayerItem') || function ([_0, spriteNames, _2], _sourceOffset) { return {type: 'COLLISION_LAYER', tiles: extractFirst(spriteNames), _sourceOffset} } %}


RuleItem ->
      RuleLoop  {% id %}
    | RuleGroup {% id %}
    | Rule      {% id %}

Rule ->
      RuleWithoutMessage    {% id %}
    | RuleWithMessage       {% id %}

RuleWithoutMessage -> _ LeftModifiers nonemptyListOf[ConditionBracket, _ (RuleModifier _):?] _ "->" (ActionBracket):* (_ RuleCommand):* lineTerminator:+                     {% toDebug('RuleWithoutMessage') || function([_0, modifiers, conditionBrackets, _2, _3, actionBrackets, commands, _6], _sourceOffset)                 {
    const directions = modifiers.filter((m: string) => ['RANDOM', 'LATE', 'RIGID'].indexOf(m) < 0)
    const isRandom = modifiers.indexOf('RANDOM') >= 0
    const isLate = modifiers.indexOf('LATE') >= 0
    const isRigid = modifiers.indexOf('RIGID') >= 0
    return {type: ast.RULE_TYPE.SIMPLE, directions, isRandom, isLate, isRigid, conditions: extractFirst(conditionBrackets), actions: extractFirst(actionBrackets), commands: extractSecond(commands), _sourceOffset}
} %}
RuleWithMessage ->    _ LeftModifiers nonemptyListOf[ConditionBracket, _ (RuleModifier _):?] _ "->" (ActionBracket):* (_ RuleCommand):* _ MessageCommand lineTerminator:*    {% toDebug('RuleWithoutMessage') || function([_0, modifiers, conditionBrackets, _2, _3, actionBrackets, commands, _6, message, _7], _sourceOffset)    {
    const directions = modifiers.filter((m: string) => ['RANDOM', 'LATE', 'RIGID'].indexOf(m) < 0)
    const isRandom = modifiers.indexOf('RANDOM') >= 0
    const isLate = modifiers.indexOf('LATE') >= 0
    const isRigid = modifiers.indexOf('RIGID') >= 0

    const cmds = extractSecond(commands)
    if (message) {
        cmds.push(message)
    }
    return {type: ast.RULE_TYPE.SIMPLE, directions, isRandom, isLate, isRigid, conditions: extractFirst(conditionBrackets), actions: extractFirst(actionBrackets), commands: cmds, _sourceOffset}
} %}

ConditionBracket ->
      NormalRuleBracket    {% ([{neighbors, againHack, debugFlag}], _sourceOffset) => { return {type: ast.BRACKET_TYPE.SIMPLE, neighbors, againHack, debugFlag, _sourceOffset} } %}
    | EllipsisRuleBracket  {% ([{beforeNeighbors, afterNeighbors, debugFlag}], _sourceOffset) => { return {type: ast.BRACKET_TYPE.ELLIPSIS, beforeNeighbors, afterNeighbors, debugFlag, _sourceOffset} } %}

ActionBracket ->
      (_ RuleModifier):* _ NormalRuleBracket    {% ([modifiers, _1, {neighbors, againHack, debugFlag}], _sourceOffset) => { return {type: ast.BRACKET_TYPE.SIMPLE, neighbors, againHack, debugFlag, _sourceOffset} } %}
    | (_ RuleModifier):* _ EllipsisRuleBracket  {% ([modifiers, _1, {beforeNeighbors, afterNeighbors, debugFlag}], _sourceOffset) => { return {type: ast.BRACKET_TYPE.ELLIPSIS, beforeNeighbors, afterNeighbors, debugFlag, _sourceOffset} } %}

LeftModifiers ->
      nonemptyListOf[RuleModifierLeft, __] _    {% ([a]) => extractFirst(a) %}
    | null                                      {% () => [] /* No modifiers */ %}

RuleBracket ->
      EllipsisRuleBracket {% id %}
    | NormalRuleBracket   {% id %}

# t_AGAIN is a HACK. It should be in the list of commands but it's not.
NormalRuleBracket -> "[" nonemptyListOf[RuleBracketNeighbor, "|"] (t_AGAIN _):? "]" (_ t_DEBUGGER):?                                                        {% toDebug('NormalRuleBracket') || function([_0, neighbors, againHack, _3, debugFlag], _sourceOffset) { return {type: '_INNER_BRACKET', neighbors: extractFirst(neighbors), againHack: againHack ? true : false, debugFlag: debugFlag ? debugFlag[1] : null, _sourceOffset} } %}
EllipsisRuleBracket -> "[" nonemptyListOf[RuleBracketNeighbor, "|"] "|" _ t_ELLIPSIS _ "|" nonemptyListOf[RuleBracketNeighbor, "|"] "]" (_ t_DEBUGGER):?    {% toDebug('EllipsisRuleBracket') || function([_0, beforeNeighbors, _2, _3, _4, _5, _6, afterNeighbors, _8, debugFlag], _sourceOffset) { return {type: '_INNER_ELLIPSIS_BRACKET', beforeNeighbors: extractFirst(beforeNeighbors), afterNeighbors: extractFirst(afterNeighbors), debugFlag: debugFlag ? debugFlag[1] : null, _sourceOffset} } %}

RuleBracketNeighbor ->
    #   HackTileNameIsSFX1 # to parse '... -> [ SFX1 ]' (they should be commands)
    # | HackTileNameIsSFX2 # to parse '... -> [ tilename SFX1 ]'
      RuleBracketNoEllipsisNeighbor {% id %}
    | RuleBracketEmptyNeighbor      {% id %}

RuleBracketNoEllipsisNeighbor ->
      _ nonemptyListOf[TileWithModifier ,__] (_ t_DEBUGGER):? _     {% toDebug('RuleBracketNoEllipsisNeighbor') || function([_0, tileWithModifiers, debugFlag, _3], _sourceOffset) { return {type: 'NEIGHBOR', tileWithModifiers: extractFirst(tileWithModifiers), debugFlag: debugFlag ? debugFlag[1] : null, _sourceOffset} } %}

# Matches `[]` as well as `[ ]`
RuleBracketEmptyNeighbor -> _       {% toDebug('RuleBracketEmptyNeighbor') || function([_0], _sourceOffset) { return {type: 'NEIGHBOR', tileWithModifiers: [], _sourceOffset} } %}

# Force-check that there is whitespace after the cellLayerModifier so things
# like "STATIONARYZ" or "NOZ" are not parsed as a modifier
# (they are a variable that happens to begin with the same text as a modifier)
TileWithModifier -> (tileModifier __):? lookupRuleVariableName  {% toDebug('TileWithModifier') || function([modifier, tile], _sourceOffset) {
    const mod = modifier ? modifier[0] : null
    let direction
    let isNegated = false
    let isRandom = false
    switch (mod) {
        case 'NO':
            isNegated = true
            break
        case 'RANDOM':
            isRandom = true
            break
        default:
            direction = mod
    }
    return {type: 'TILE_WITH_MODIFIER', direction, isNegated, isRandom, tile, _sourceOffset}
} %}

# tileModifier -> tileModifierInner {% debugRule('TILEMODIFIER') %}

tileModifier ->
      t_NO              {% upperId %}
    | t_LEFT            {% upperId %}
    | t_RIGHT           {% upperId %}
    | t_UP              {% upperId %}
    | t_DOWN            {% upperId %}
    | t_RANDOMDIR       {% upperId %}
    | t_RANDOM          {% upperId %}
    | t_STATIONARY      {% upperId %}
    | t_MOVING          {% upperId %}
    | t_ACTION          {% upperId %}
    | t_VERTICAL        {% upperId %}
    | t_HORIZONTAL      {% upperId %}
    | t_PERPENDICULAR   {% upperId %}
    | t_PARALLEL        {% upperId %}
    | t_ORTHOGONAL      {% upperId %}
    | t_ARROW_ANY       {% upperId %} # NOTE: This can be a "v"

RuleModifier ->
      t_RANDOM      {% upperId %}
    | t_UP          {% upperId %}
    | t_DOWN        {% upperId %}
    | t_LEFT        {% upperId %}
    | t_RIGHT       {% upperId %}
    | t_VERTICAL    {% upperId %}
    | t_HORIZONTAL  {% upperId %}
    | t_ORTHOGONAL  {% upperId %}

RuleModifierLeft ->
      RuleModifier  {% id %} # Sometimes people write "RIGHT LATE [..." instead of "LATE RIGHT [..."
    | t_LATE        {% upperId %}
    | t_RIGID       {% upperId %}

RuleCommand ->
      t_AGAIN       {% (_0, _sourceOffset) => { return {type: ast.COMMAND_TYPE.AGAIN, _sourceOffset} } %}
    | t_CANCEL      {% (_0, _sourceOffset) => { return {type: ast.COMMAND_TYPE.CANCEL, _sourceOffset} } %}
    | t_CHECKPOINT  {% (_0, _sourceOffset) => { return {type: ast.COMMAND_TYPE.CHECKPOINT, _sourceOffset} } %}
    | t_RESTART     {% (_0, _sourceOffset) => { return {type: ast.COMMAND_TYPE.RESTART, _sourceOffset} } %}
    | t_WIN         {% (_0, _sourceOffset) => { return {type: ast.COMMAND_TYPE.WIN, _sourceOffset} } %}
    | t_SFX         {% ([sound], _sourceOffset) => { return {type: ast.COMMAND_TYPE.SFX, sound, _sourceOffset} } %}

MessageCommand -> t_MESSAGE messageLine {% ([_1, message], _sourceOffset) => { return {type: ast.COMMAND_TYPE.MESSAGE, message, _sourceOffset} } %}

RuleLoop ->
    (_ t_DEBUGGER):?
    _ t_STARTLOOP lineTerminator:+
    (RuleItem):+
    _ t_ENDLOOP lineTerminator:+      {% ([_0, _1, _2, _3, rules, _4, _5, _6]) => { return {type: ast.RULE_TYPE.LOOP, rules: extractFirst(rules)} } %}

RuleGroup ->
    Rule
    (_ t_GROUP_RULE_PLUS Rule):+    {% ([firstRule, otherRules], _sourceOffset) => { return {type: ast.RULE_TYPE.GROUP, rules: [firstRule].concat(extractThird(otherRules)), _sourceOffset} } %}

# HackTileNameIsSFX1 -> t_SFX __ t_DEBUGGER:?
# HackTileNameIsSFX2 -> lookupRuleVariableName __ t_SFX __ t_DEBUGGER:?


WinConditionItem ->
      _ winConditionItemPrefix __ lookupRuleVariableName lineTerminator:+       {% toDebug('WinConditionItem') || function([_0, qualifier, _1, tile, _2], _sourceOffset) { return {type: ast.WIN_CONDITION_TYPE.SIMPLE, qualifier, tile, _sourceOffset} } %}
    | _ winConditionItemPrefix __ lookupRuleVariableName __ t_ON __ lookupRuleVariableName lineTerminator:+     {% toDebug('WinConditionItem') || function([_0, qualifier, _1, tile, _2, _3, _4, onTile, _5], _sourceOffset) { return {type: ast.WIN_CONDITION_TYPE.ON, qualifier, tile, onTile, _sourceOffset} } %}

winConditionItemPrefix ->
      t_NO      {% id %}
    | t_ALL     {% id %}
    | t_ANY     {% id %}
    | t_SOME    {% id %}


LevelItem ->
      GameMessageLevel  {% id %}
    | levelMapRow       {% id %}
    | SeparatorLine     {% id %}


# Ensure we collect characters up to the last non-whitespace
GameMessageLevel -> _ t_MESSAGE messageLine {% ([_0, _1, message], _sourceOffset) => { return {type: 'LEVEL_MESSAGE', message, _sourceOffset} } %}
# This does not use a lineTerminator because it needs to consume parentheses
messageLine -> [^\n]:* [\n] {% toDebug('messageLine') || function([message, _2]) { return message.join('').trim() } %}
levelMapRow -> _ [^\n \t\(]:+ lineTerminator {% ([_0, cols]: string[][], _sourceOffset, reject) => {
  const str = cols.join('')
  if (str.toUpperCase().startsWith('MESSAGE')) {
    return reject
  } else {
    return {type: 'LEVEL_ROW', cells: cols.map(([char]) => char[0]), _sourceOffset}
  }
}
%}

SeparatorLine -> lineTerminator {% (_0, _sourceOffset) => { return {type:'LEVEL_SEPARATOR', _sourceOffset} } %}