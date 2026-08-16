import { useEffect } from 'react'

function useBodyModalLock(locked: boolean) {
  useEffect(() => {
    document.body.classList.toggle('modal-is-open', locked)

    return () => document.body.classList.remove('modal-is-open')
  }, [locked])
}

export default useBodyModalLock
