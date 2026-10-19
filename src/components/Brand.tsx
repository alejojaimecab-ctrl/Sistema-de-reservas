type BrandProps = { compact?: boolean; inverse?: boolean }

export function Brand({ compact = false, inverse = false }: BrandProps) {
  return (
    <div className={`brand ${inverse ? 'brand--inverse' : ''}`} aria-label="RESER, sistema de reservas">
      <img src="/brand/Reser-logo.png" alt="RESER logo" height={compact ? 40 : 60} style={{ marginTop: 8, filter: 'grayscale(1) brightness(2.6)' }} />
    </div>
  );
}
