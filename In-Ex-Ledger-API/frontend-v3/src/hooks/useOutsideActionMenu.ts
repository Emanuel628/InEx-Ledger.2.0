import { useEffect } from 'react'

const menuWidth = 184
const filterPopoverWidth = 280
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

function clearFilterPopoverPosition() {
  document.documentElement.style.removeProperty('--filter-popover-left')
  document.documentElement.style.removeProperty('--filter-popover-top')
}

/**
 * Filter popovers live inside `.table-panel`/`.message-thread-list`, which
 * clip overflow to round their corners. Fixed-positioning the popover (like
 * the row action menu above) escapes that clipping instead of being cut off.
 */
function positionOpenFilterPopover() {
  const trigger = document.querySelector('.filter-icon-button[aria-expanded="true"]')
  if (!(trigger instanceof HTMLElement)) {
    clearFilterPopoverPosition()
    return
  }

  const rect = trigger.getBoundingClientRect()
  const popover = document.querySelector('.filter-popover')
  const measuredWidth = popover instanceof HTMLElement ? popover.offsetWidth : filterPopoverWidth
  const measuredHeight = popover instanceof HTMLElement ? popover.offsetHeight : 160
  const left = Math.min(
    window.innerWidth - measuredWidth - viewportGutter,
    Math.max(viewportGutter, rect.right - measuredWidth),
  )
  const belowTop = rect.bottom + 10
  const top =
    belowTop + measuredHeight > window.innerHeight - viewportGutter
      ? Math.max(viewportGutter, rect.top - measuredHeight - 10)
      : belowTop

  document.documentElement.style.setProperty('--filter-popover-left', `${left}px`)
  document.documentElement.style.setProperty('--filter-popover-top', `${top}px`)
}

function useOutsideActionMenu(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) {
      clearActionMenuPosition()
      clearFilterPopoverPosition()
      return undefined
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.row-action, .row-action-menu, .filter-popover-wrap')) return
      onClose()
    }
    const reposition = () => {
      positionOpenActionMenu()
      positionOpenFilterPopover()
    }
    const animationFrame = window.requestAnimationFrame(reposition)

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      clearActionMenuPosition()
      clearFilterPopoverPosition()
    }
  }, [isOpen, onClose])
}

export default useOutsideActionMenu
