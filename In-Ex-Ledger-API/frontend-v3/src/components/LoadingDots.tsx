import { useEffect, useState } from 'react'

const DOT_INTERVAL_MS = 350
const MAX_DOTS = 3

/** Loading indicator: adds one "." at a time up to three, then resets to none and repeats. */
function LoadingDots() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCount((value) => (value + 1) % (MAX_DOTS + 1))
    }, DOT_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <span className="loading-dots" aria-hidden="true">
      {'.'.repeat(count)}
    </span>
  )
}

export default LoadingDots
