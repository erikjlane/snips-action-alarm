import { Alarm, SerializedAlarm } from './alarm'
import { DateRange } from '../../utils'
import { logger } from 'snips-toolkit'
import fs from 'fs'
import path from 'path'
import { Hermes } from 'hermes-javascript'
import { DB_DIR } from '../../constants'

function isDateInRange(date: Date, dateRange: DateRange) {
    return date >= dateRange.min && date < dateRange.max
}

export class Database {
    alarms: Alarm[] = []
    hermes: Hermes

    constructor(hermes: Hermes) {
        this.hermes = hermes
        this.loadSavedAlarms()
    }

    /**
     * Load from file system
     */
    loadSavedAlarms() {
        const savedIds: string[] = fs.readdirSync(path.resolve(DB_DIR))
        logger.info(`Found ${savedIds.length} saved alarms!`)

        try {
            savedIds.forEach(id => {
                const pathAbs = path.resolve(DB_DIR, id)
                logger.debug('Reading: ', pathAbs)

                const data: SerializedAlarm = JSON.parse(fs.readFileSync(pathAbs).toString())

                const now = new Date()
                const date = new Date(data.date)

                if (now < date || data.recurrence) {
                    this.add(date, data.recurrence || undefined, data.name, data.id)
                } else {
                    fs.unlink(path.resolve(DB_DIR, `${ data.id }.json`), (err) => {
                        if (err) {
                            throw new Error(err.message)
                        }
                        logger.info(`Deleted alarm: ${ data.id }`)
                    })
                }
            })
        } catch (err) {
            logger.error(err)
        }
    }

    add(date: Date, recurrence?: string, name?: string, id?: string): Alarm {
        const alarm = new Alarm(this.hermes, date, recurrence, name, id)
        alarm.save()
        this.alarms.push(alarm)

        alarm.on('shouldBeDeleted', alarm => {
            this.deleteById(alarm.id)
        })

        return alarm
    }

    /**
     * Get alarms
     *
     * @param name
     * @param range
     * @param recurrence
     */
    get(name?: string, range?: DateRange, recurrence?: string) {
        return this.alarms.filter(alarm =>
            (!name || alarm.name === name) &&
            (!range || isDateInRange(alarm.date, range)) &&
            (!recurrence || alarm.recurrence === recurrence)
        ).sort((a, b) => {
            return (a.date.getTime() - b.date.getTime())
        })
    }

    /**
     * Get an alarm by its id
     *
     * @param id
     */
    getById(id: string): Alarm {
        const res = this.alarms.filter(alarm => alarm.id === id)
        if (res.length === 0) {
            throw new Error('canNotFindAlarm')
        }
        return res[0]
    }

    /**
     * Delete an existing alarm from database
     *
     * @param id
     */
    deleteById(id: string): boolean {
        const alarm = this.getById(id)
        if (alarm) {
            alarm.delete()
            this.alarms.splice(this.alarms.indexOf(alarm), 1)
            return true
        }

        return false
    }

    /**
     * Delete all alarms
     */
    deleteAll() {
        this.alarms.forEach(alarm => {
            alarm.delete()
        })
        this.alarms.splice(0)
    }

    /**
     * Disable all the alarms and release memory
     */
    destroy() {
        // disable all the alarms (task crons)
        this.alarms.forEach(alarm => {
            alarm.destroy()
        })
    }
}
