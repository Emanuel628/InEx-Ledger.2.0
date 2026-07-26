import AppShell from '../components/AppShell'
import type { PageProps } from '../App'

function PlaceholderPage(props: PageProps) {
  return (
    <AppShell {...props} searchPlaceholder={`Search ${props.activePage.toLowerCase()}`}>
      <main className="transactions-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>{props.activePage}</h1>
            <p>This page is ready in the navigation. We will design and build it together next.</p>
          </div>
        </section>
      </main>
    </AppShell>
  )
}

export default PlaceholderPage
