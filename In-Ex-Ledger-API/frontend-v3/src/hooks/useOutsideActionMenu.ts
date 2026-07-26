import { useEffect } from 'react'

const menuWidth = 184
const viewportGutter = 12

function clearActionMenuPosition() {
  document.documentElement.style.removeProperty('--row-action-menu-left')
  document.documentElement.style.removeProperty('--row-action-menu-top')
  document.documentElement.style.removeProperty('--row-action-menu-width')
}

function positionOpenActionMenu() {
  const trigger = document.querySelector('.row-action[aria-expanded="true"]')
  if (!(trigger instanceof HTMLElement)) {
    clearActionMenuPosition()
    return
  }

  const rect = trigger.getBoundingClientRect()
  const menu = document.querySelector('.row-action-menu')
  const measuredHeight = menu instanceof HTMLElement ? menu.offsetHeight : 220
  const width = Math.min(menuWidth, window.innerWidth - viewportGutter * 2)
  const left = Math.min(
    window.innerWidth - width - viewportGutter,
    Math.max(viewportGutter, rect.right - width),
  )
  const belowTop = rect.bottom + 8
  const top =
    belowTop + measuredHeight > window.innerHeight - viewportGutter
      ? Math.max(viewportGutter, rect.top - measuredHeight - 8)
      : belowTop

  document.documentElement.style.setProperty('--row-action-menu-left', `${left}px`)
  document.documentElement.style.setProperty('--row-action-menu-top', `${top}px`)
  document.documentElement.style.setProperty('--row-action-menu-width', `${width}px`)
}

function useOutsideActionMenu(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) {
      clearActionMenuPosition()
      return undefined
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.row-action, .row-action-menu, .filter-popover-wrap')) return
      onClose()
    }
    const reposition = () => positionOpenActionMenu()
    const animationFrame = window.requestAnimationFrame(positionOpenActionMenu)

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      clearActionMenuPosition()
    }
  }, [isOpen, onClose])
}

export default useOutsideActionMenu
