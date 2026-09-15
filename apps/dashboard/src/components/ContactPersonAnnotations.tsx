import { Check } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  contactAnnotationLabel, contactRoleLabels, resolveContactRole,
  type ContactAnnotation, type EditableContactRole,
} from '../lib/contact-inspection';

const choices: readonly { role: EditableContactRole; color: string }[] = [
  { role: 'auto', color: '黄色' },
  { role: 'passerby', color: '蓝色' },
  { role: 'suspect', color: '红色' },
];

type Props = {
  annotations: readonly ContactAnnotation[];
  selectedId: string;
  panelId: string;
  onSelect: (annotation: ContactAnnotation) => void;
  onRoleChange: (id: string, role: EditableContactRole) => void;
};

export function ContactPersonAnnotations({ annotations, selectedId, panelId, onSelect, onRoleChange }: Props) {
  const [pickerId, setPickerId] = useState('');
  const layer = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const titleId = useId();
  const active = annotations.find(annotation => annotation.id === pickerId);
  const activeRole = active && resolveContactRole(active);
  const isOpen = Boolean(active && activeRole !== 'victim');

  function closePicker(restoreFocus = false) {
    setPickerId('');
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    const container = layer.current;
    const popup = menu.current;
    const anchor = trigger.current;
    if (!isOpen || !container || !popup || !anchor) return;

    function position() {
      if (!container || !popup || !anchor) return;
      const padding = 6;
      const gap = 8;
      const width = popup.offsetWidth;
      const height = popup.offsetHeight;
      let left = anchor.offsetLeft + anchor.offsetWidth + gap;
      let top = anchor.offsetTop;
      if (left + width > container.clientWidth - padding) {
        left = anchor.offsetLeft - width - gap;
        if (left < padding) {
          left = anchor.offsetLeft;
          top = anchor.offsetTop + anchor.offsetHeight + gap;
        }
      }
      popup.style.left = `${Math.max(padding, Math.min(left, container.clientWidth - width - padding))}px`;
      popup.style.top = `${Math.max(padding, Math.min(top, container.clientHeight - height - padding))}px`;
    }

    position();
    popup.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    observer.observe(container);
    observer.observe(popup);
    return () => observer.disconnect();
  }, [isOpen, pickerId]);

  useEffect(() => {
    if (!isOpen) return;
    function dismiss(event: PointerEvent) {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) closePicker();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closePicker(true);
    }
    document.addEventListener('pointerdown', dismiss);
    // Capture Escape before the enclosing record modal sees it.
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape, true);
    };
  }, [isOpen]);

  return <div className="cr-person-annotations" ref={layer}>
    {annotations.map(annotation => {
      const role = resolveContactRole(annotation);
      const editable = role !== 'victim';
      const label = contactAnnotationLabel({ ...annotation, role });
      return <button type="button" key={annotation.id}
        className={`cr-person-box ${annotation.person} role-${role}`}
        data-annotation-id={annotation.id}
        aria-label={`查看${label} 脱敏信息`}
        aria-pressed={selectedId === annotation.id}
        aria-haspopup={editable ? 'menu' : undefined}
        aria-expanded={editable ? pickerId === annotation.id : undefined}
        aria-controls={editable && pickerId === annotation.id ? `${panelId} ${menuId}` : panelId}
        title={`${label} · ${role === 'auto' ? '默认状态' : '人工指定的演示角色'}`}
        style={{ left: `${annotation.bounds[0]}%`, top: `${annotation.bounds[1]}%`, width: `${annotation.bounds[2]}%`, height: `${annotation.bounds[3]}%` }}
        onClick={event => {
          onSelect(annotation);
          trigger.current = event.currentTarget;
          setPickerId(editable && pickerId !== annotation.id ? annotation.id : '');
        }}>
        <span><span className="cr-person-role">{contactRoleLabels[role]}</span>{annotation.label}</span>
      </button>;
    })}
    {isOpen && active && <div ref={menu} id={menuId} className="cr-person-role-picker"
      role="menu" aria-labelledby={titleId}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) closePicker();
      }}
      onKeyDown={event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      <strong id={titleId}>选择人物 {active.label} 的身份</strong>
      {choices.map(({ role, color }) => <button type="button" key={role} role="menuitemradio"
        aria-checked={activeRole === role} tabIndex={activeRole === role ? 0 : -1}
        onClick={() => { onRoleChange(active.id, role); closePicker(true); }}>
        <i className={`cr-role-swatch role-${role}`} aria-hidden="true" />
        <span>{color} · {contactRoleLabels[role]}</span>
        <Check size={14} aria-hidden="true" className={activeRole === role ? undefined : 'cr-role-check-hidden'} />
      </button>)}
    </div>}
  </div>;
}
