type BrandProps = { compact?: boolean; inverse?: boolean }

export function Brand({ compact = false, inverse = false }: BrandProps) {
  return (
    <div className={`brand ${inverse ? 'brand--inverse' : ''}`} aria-label="RESER, sistema de reservas">
      <img src="/brand/Reser-logo.jpg" alt="RESER logo" width={compact ? 20 : 24} height={compact ? 20 : 24} />
    </div>
  );
}
