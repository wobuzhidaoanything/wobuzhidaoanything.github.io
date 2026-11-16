import type { MouseEvent } from 'react'
import { Link, useNavigate, type LinkProps } from 'react-router'
import {
  focusRouteHeading,
  runViewTransition,
  type NavigationTransitionType,
  type TransitionSource,
} from '@/lib/viewTransitions'

interface TransitionLinkProps extends LinkProps {
  direction?: NavigationTransitionType
  memberSlug?: string | null
  transitionSource?: TransitionSource
  onBeforeNavigate?: () => void
}

export function TransitionLink({
  to,
  direction = 'forward',
  memberSlug = null,
  transitionSource = null,
  onBeforeNavigate,
  onClick,
  ...props
}: TransitionLinkProps) {
  const navigate = useNavigate()

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented) return

    if (
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      props.target === '_blank'
    ) {
      return
    }

    e.preventDefault()
    onBeforeNavigate?.()

    runViewTransition({
      types: [direction],
      mode: memberSlug ? 'member' : 'idle',
      memberSlug,
      source: memberSlug ? transitionSource : null,
      update: () => {
        navigate(to)
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
      },
      onFinished: () => {
        focusRouteHeading()
      },
    })
  }

  return <Link to={to} onClick={handleClick} {...props} />
}
