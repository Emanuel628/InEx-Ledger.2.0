import { useState } from 'react'

function useSessionDismissed(key: string) {
  const storageKey = `dismissed:${key}`
  const [visible, setVisible] = useState(() => sessionStorage.getItem(storageKey) !== 'true')

  function dismiss() {
    sessionStorage.setItem(storageKey, 'true')
    setVisible(false)
  }

  return [visible, dismiss] as const
}

export default useSessionDismissed
