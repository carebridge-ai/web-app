'use client'

export function PrintButton() {
  return (
    <div className="mt-4 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="btn-primary mx-auto block max-w-[200px]"
      >
        Print this page
      </button>
    </div>
  )
}
