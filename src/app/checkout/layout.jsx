/**
 * src/app/checkout/layout.jsx
 * Minimal wrapper — each step page manages its own header and progress bar.
 */
export default function CheckoutLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}
