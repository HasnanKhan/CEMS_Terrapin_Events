import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { field, formText, integer, optionalId, Problem } from '../lib/input.js'
import { validPassword } from '../lib/password.js'

describe('input validation', () => {
  it('trims fields and accepts text at its character limit', () => {
    const form = new FormData()
    form.set('title', "  Terps' Day  ")
    assert.equal(field(form, 'title', 10), "Terps' Day")
    assert.equal(field(form, 'missing'), '')
    assert.throws(() => field(form, 'title', 9), Problem)
  })

  it('gives required and optional identifiers the same positive int32 range', () => {
    for (const boundary of [1, ' 002 ', '2147483647']) {
      assert.equal(integer(boundary), Number(boundary))
      assert.equal(optionalId(boundary), Number(boundary))
    }
    for (const boundary of [null, '', '0', '-1', '1.5', '2147483648', 'Infinity', 'word', '1e2', '0x10', true, ['1']]) {
      assert.throws(() => integer(boundary), Problem)
      assert.equal(optionalId(boundary), null)
    }
  })

  it('preserves password whitespace and multiline text while rejecting invalid scalar fields', () => {
    const form = new FormData()
    form.set('password', ' LeadingAndTrailingSpace1 ')
    form.set('description', '  Welcome テラピン\nJoin us!  ')
    assert.equal(formText(form, 'password'), ' LeadingAndTrailingSpace1 ')
    assert.equal(field(form, 'description'), 'Welcome テラピン\nJoin us!')

    form.set('title', 'Campus\0event')
    assert.throws(() => field(form, 'title'), Problem)
    form.set('title', new Blob(['Example']))
    assert.throws(() => field(form, 'title'), Problem)
    form.set('title', 'Campus event')
    form.append('title', 'Repeated title')
    assert.throws(() => field(form, 'title'), Problem)
  })
})

describe('password policy', () => {
  it('accepts 12 through 128 characters with a letter and a digit', () => {
    assert.equal(validPassword('Aa1234567890'), true)
    assert.equal(validPassword('A' + '0'.repeat(127)), true)
  })

  it('rejects passwords outside the bounds and those missing a letter or digit', () => {
    for (const password of ['A1234567890', 'A' + '0'.repeat(128), '123456789012', 'OnlyLettersHere']) {
      assert.equal(validPassword(password), false)
    }
  })
})
