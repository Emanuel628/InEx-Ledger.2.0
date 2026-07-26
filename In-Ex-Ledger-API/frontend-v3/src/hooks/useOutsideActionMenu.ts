import { useEffect } from 'react'

function useOutsideActionMenu(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return undefined

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.row-action, .row-action-menu')) return
      onClose()
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [isOpen, onClose])
}

export default useOutsideActionMenu
