const chars = require('./chars')
const NativeKeymap = require('native-keymap')
const _ = require('lodash')
const PlatformAware = require('./PlatformAware')
const Notification = require('./Notification')
const KEY_BACKSPACE = 'Backspace'
const KEY_ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
const KEY_TAB = 'Tab'

class SnippetsManager {
    constructor({ store, keyboardHandler, keyboardSimulator, clipboard, analytics }) {
        this.store = store
        this.keyboardHandler = keyboardHandler
        this.keyboardSimulator = keyboardSimulator
        this.clipboard = clipboard
        this.analytics = analytics

        this.buffer = ''
        this.shouldMatch = true
        this.timeout = 5000 // 5 seconds

        this.keyboardSimulator.setKeyboardDelay(0)

        this.keyboardHandler.on('keydown', this._onKeyDown.bind(this))
        this.keyboardHandler.on('mouseclick', this._onMouseClick.bind(this))

        this.keyboardHandler.start()

        if (PlatformAware.mac()) {
            require('fix-path')()
        }

        this._ensureAllFieldsArePresent()
    }

    _ensureAllFieldsArePresent() {
        const snippets = this.store.get('snippets').map(s => {
            s.active = (s.active === undefined) ? true : s.active
            s.regex = (s.regex === undefined) ? false : s.regex
            s.type = s.type || 'plain'
            return s
        })
        this.store.set('snippets', snippets)
    }

    destructor() {
        this.keyboardHandler.unload()
        this.keyboardHandler.stop()
    }

    _isBackspace(keycode) {
        return this._getCharNameFromKeycode(keycode) === KEY_BACKSPACE
    }

    _getCharNameFromKeycode(keycode) {
        return _.get(chars, keycode, null)
    }

    _eventToUnicode({ keycode, shiftKey, altKey, ctrlKey, metaKey }) {
        const name = this._getCharNameFromKeycode(keycode)
        const keymap = NativeKeymap.getKeyMap()

        if (!name || !(name in keymap)) {
            return false
        }

        let value

        if (shiftKey && altKey && !ctrlKey && !metaKey) {
            value = _.get(keymap, `${name}.withShiftAltGr`, false)
        } else if (shiftKey && !ctrlKey && !metaKey) {
            value = _.get(keymap, `${name}.withShift`, false)
        } else if (altKey && !ctrlKey && !metaKey) {
            value = _.get(keymap, `${name}.withAltGr`, false)
        } else if (!ctrlKey && !metaKey) {
            value = _.get(keymap, `${name}.value`, false)
        } else {
            value = false
        }

        if (!value) {
            return false
        }

        return value
    }

    _resetBuffer() {
        this.buffer = ''
    }

    _onMouseClick() {
        this._resetBuffer()
    }

    _shouldResetBuffer({ keycode, altKey }) {
        const pressed = this._getCharNameFromKeycode(keycode)

        return (pressed === KEY_BACKSPACE && altKey === true)
            || (pressed === KEY_TAB)
            || (KEY_ARROWS.includes(pressed))
    }

    _onKeyDown(e) {
        if (!this.shouldMatch) {
            return
        }

        if (this._shouldResetBuffer(e)) {
            this._resetBuffer()
            return
        }

        if (this._isBackspace(e.keycode)) {
            this._shortenBufferBy(1)
            return
        }

        const character = this._eventToUnicode(e)

        if (character) {
            this._addCharToBuffer(character)
            this._shortenBufferIfNecessary()
            this._replaceSnippetIfMatchFound()
        }
    }

    _reportToAnalytics(snippet) {
        this.analytics.report('snippet-replacement', {
            user: this.store.get('user'),
            regex: snippet.regex,
            type: snippet.type,
        })
    }

    _evaluate(matchedString, code) {
        return new Promise((resolve, reject) => {
            'use strict'

            const timeout = setTimeout(() => reject('Function timed out after 5 seconds of inactivity'), this.timeout)

            let executable

            try {
                executable = eval(`
                    const fetch = require('node-fetch');
                    const exec = require('child_process').exec;
                    (${code})
                `)
            } catch (err) {
                reject(String(err))
            }

            if (!_.isFunction(executable)) {
                reject('Used snippet code is not a function')
            }

            const r = (data) => {
                clearTimeout(timeout)

                resolve(data)
            }

            let e

            try {
                e = executable(matchedString)
            } catch (err) {
                reject(err)
            }

            if (_.isObject(e) && _.isFunction(e.then)) {
                e.then(r).catch(reject)
            } else if (_.isString(e) || _.isNumber(e)) {
                r(e)
            } else {
                reject('User-defined function returned invalid type. Expected a Promise, string or number.')
            }
        })
    }

    async _replaceSnippetIfMatchFound() {
        for (const snippet of this.store.get('snippets')) {
            if (!snippet.active) {
                continue
            }

            let key = snippet.key

            if (!snippet.regex) {
                key = _.escapeRegExp(key)
            }

            const match = new RegExp(`.*(${key})$`).exec(this.buffer)
            const matchedString = _.get(match, 1, false)

            if (matchedString) {
                for (let i = 0; i < matchedString.length; i++) {
                    this.keyboardSimulator.keyTap('backspace')
                }

                if (snippet.type === 'js') {
                    this.replace(await this._handleJavascriptSnippet(matchedString, snippet.value))
                } else {
                    this.replace(this._handlePlainTextSnippet(snippet.value))
                }

                this._reportToAnalytics(snippet)

                break
            }
        }
    }

    replace(value) {
        const clipboardContent = this.clipboard.readText()

        this.clipboard.writeText(value)

        setTimeout(() => this.keyboardSimulator.keyTap('v', 'command'), 50)
        setTimeout(() => this.clipboard.writeText(clipboardContent), 500)
    }

    async _handleJavascriptSnippet(matchedString, code) {
        try {
            return await this._evaluate(matchedString, code)
        } catch (error) {
            if (!Notification.isSupported()) {
                return `QWError ${_.get('error', 'message', String(error))}`
            }

            Notification.show('QWError', _.get('error', 'message', String(error)))

            return ''
        }
    }

    paste() {
        if (PlatformAware.mac()) {
            this.keyboardSimulator.keyTap('v', 'command')
        } else {
            this.keyboardSimulator.keyTap('v', 'control')
        }
    }

    _handlePlainTextSnippet(value) {
        return value
    }

    _addCharToBuffer(character) {
        this.buffer += character
    }

    _shortenBufferBy(amount) {
        this.buffer = this.buffer.substring(0, this.buffer.length - amount)
    }

    _shortenBufferIfNecessary() {
        if (this.buffer.length > this.store.get('bufferLength')) {
            this.buffer = this.buffer.substring(1)
        }
    }
}

module.exports = SnippetsManager
