import { ArrowLeft } from 'lucide-react'
import { GROUP_META } from '@/data/capstone'
import { TransitionLink } from '@/components/TransitionLink'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle(`Page Not Found | ${GROUP_META.title}`)

  return (
    <div className="page-shell">
      <section className="not-found-block">
        <p className="masthead-eyebrow">404 · Route Not Found</p>
        <h1 id="main-content" tabIndex={-1} className="masthead-title">
          This page does not exist.
        </h1>
        <p className="masthead-lead">
          Return to the Group 07 roster, skills matrix, or capstone brief.
        </p>
        <TransitionLink to="/" direction="backward" className="primary-action-link">
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Return to Roster</span>
        </TransitionLink>
      </section>
    </div>
  )
}
