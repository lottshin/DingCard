export function createUserAssetLock() {
  const queues = new Map()

  return {
    get size() {
      return queues.size
    },

    async run(userId, task) {
      if (typeof userId !== 'string' || userId.trim() === '') {
        throw new TypeError('userId must be a non-empty string')
      }
      if (typeof task !== 'function') {
        throw new TypeError('task must be a function')
      }

      const previous = queues.get(userId) ?? Promise.resolve()
      let release
      const current = new Promise((resolve) => {
        release = resolve
      })
      queues.set(userId, current)

      await previous
      try {
        return await task()
      } finally {
        release()
        if (queues.get(userId) === current) {
          queues.delete(userId)
        }
      }
    },
  }
}
