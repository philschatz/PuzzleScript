import { IColor } from './colors'

export class Dimension {
    public readonly width: number
    public readonly height: number

    constructor(width: number, height: number) {
        this.width = width
        this.height = height
    }
}

export class GameMetadata {
    public author?: string
    public homepage?: string
    public youtube?: string
    public zoomscreen?: Dimension
    public flickscreen?: Dimension
    public colorPalette?: string
    public backgroundColor?: IColor
    public textColor?: IColor
    public realtimeInterval?: number
    public keyRepeatInterval?: number
    public againInterval?: number
    public noAction: boolean
    public noUndo: boolean
    public runRulesOnLevelStart?: string
    public noRepeatAction: boolean
    public throttleMovement: boolean
    public noRestart: boolean
    public requirePlayerMovement: boolean
    public verboseLogging: boolean

    constructor() {
        this.noAction = false
        this.noUndo = false
        this.noRepeatAction = false
        this.throttleMovement = false
        this.noRestart = false
        this.requirePlayerMovement = false
        this.verboseLogging = false
    }

    public _setValue(key: string, value: boolean | number | string | Dimension | IColor) {
        switch (key.toLowerCase()) {
            case 'author': this.author = value as string; break
            case 'homepage': this.homepage = value as string; break
            case 'youtube': this.youtube = value as string; break
            case 'zoomscreen': this.zoomscreen = value as Dimension; break
            case 'flickscreen': this.flickscreen = value as Dimension; break
            case 'colorpalette':
            case 'color_palette': this.colorPalette = value as string; break
            case 'backgroundcolor':
            case 'background_color': this.backgroundColor = value as IColor; break
            case 'textcolor':
            case 'text_color': this.textColor = value as IColor; break
            case 'realtimeinterval':
            case 'realtime_interval': this.realtimeInterval = value as number; break
            case 'keyrepeatinterval':
            case 'key_repeat_interval': this.keyRepeatInterval = value as number; break
            case 'againinterval':
            case 'again_interval': this.againInterval = value as number; break
            case 'noaction': this.noAction = value as boolean; break
            case 'noundo': this.noUndo = value as boolean; break
            case 'runrulesonlevelstart':
            case 'run_rules_on_level_start': this.runRulesOnLevelStart = value as string; break
            case 'norepeataction':
            case 'norepeat_action': this.noRepeatAction = value as boolean; break
            case 'throttlemovement':
            case 'throttle_movement': this.throttleMovement = value as boolean; break
            case 'norestart': this.noRestart = value as boolean; break
            case 'requireplayermovement':
            case 'require_player_movement': this.requirePlayerMovement = value as boolean; break
            case 'verboselogging':
            case 'verbose_logging': this.verboseLogging = value as boolean; break
            default:
                throw new Error(`BUG: Unsupported config field "${key}" with value "${value}"`)
        }
    }
}
