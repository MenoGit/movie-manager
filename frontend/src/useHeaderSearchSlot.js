import { useEffect, useState } from 'react'

/**
 * Desktop-only header search relocation. Returns the header's search slot
 * element when the viewport is >= 769px (pages then portal their search
 * form into it), or null (pages render the form inline below the header —
 * the mobile position). The page keeps full ownership of the search state
 * and handlers either way; only where the form mounts changes.
 */
export default function useHeaderSearchSlot() {
  const [slot, setSlot] = useState(null)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)')
    const update = () =>
      setSlot(mq.matches ? document.querySelector('.header-search-slot') : null)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return slot
}
