import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// Campo de contraseña con un ojito a la derecha para ver lo que se escribió y no equivocarse
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return <span className="password-field">
    <input {...props} type={visible ? 'text' : 'password'} />
    <button
      type="button"
      className="password-toggle"
      aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      aria-pressed={visible}
      title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      // Con el mouse, el foco y el cursor se quedan en el campo mientras se mira la contraseña
      onMouseDown={event => event.preventDefault()}
      onClick={() => setVisible(current => !current)}
    >
      {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
    </button>
  </span>
}
