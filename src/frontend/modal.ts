import { dom } from './lib/dom.js';

export const modalPopUp = (msg, onEnter) => {
  const overlay = dom(['div.modal-overlay', [
    ['div.modal', [
      ['p', msg],
      ['input.modal-input', {
        type: 'text',
        placeholder: 'Session name...',
        onkeydown: (e) => {
          if (e.key === 'Enter') {
            const name = e.target.value.trim();
            if (name) {
              document.body.removeChild(overlay);
              onEnter(name);
            }
          }
        }
      }]
    ]]
  ]]);
  
  document.body.appendChild(overlay);
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
};