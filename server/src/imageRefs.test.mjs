import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectManagedImagePaths,
  normalizeManagedImagePath,
} from './imageRefs.js'

test('normalizeManagedImagePath normalizes relative and absolute managed URLs', () => {
  assert.equal(normalizeManagedImagePath('/uploads/a.png', '/uploads'), '/uploads/a.png')
  assert.equal(
    normalizeManagedImagePath('https://host/uploads/a.png?x=1#preview', '/uploads'),
    '/uploads/a.png',
  )
})

test('normalizeManagedImagePath rejects unmanaged and non-path image references', () => {
  for (const value of [
    'https://host/other/a.png',
    'data:image/png;base64,abc',
    'blob:https://host/id',
    'img:image-id',
    '/uploads-evil/a.png',
    null,
    undefined,
    42,
  ]) {
    assert.equal(normalizeManagedImagePath(value, '/uploads'), null)
  }
})

test('collectManagedImagePaths recursively collects unique managed paths', () => {
  const document = {
    cover: '/uploads/a.png',
    slides: [
      { src: 'https://cdn.example/uploads/b.webp?size=2' },
      null,
      ['/uploads/a.png', { ignored: '/other/c.png' }],
    ],
  }

  assert.deepEqual(
    collectManagedImagePaths(document, '/uploads'),
    ['/uploads/a.png', '/uploads/b.webp'],
  )
  assert.deepEqual(collectManagedImagePaths(null, '/uploads'), [])
  assert.deepEqual(collectManagedImagePaths([], '/uploads'), [])
  assert.deepEqual(collectManagedImagePaths({}, '/uploads'), [])
})

test('collectManagedImagePaths handles cyclic objects without overflowing the stack', () => {
  const document = { src: '/uploads/a.png' }
  document.self = document
  document.children = [document]

  assert.deepEqual(collectManagedImagePaths(document, '/uploads'), ['/uploads/a.png'])
})
