import React from 'react';
import type { WikiSection } from './wiki.types';

export function renderSection(section: WikiSection, idx: number): React.ReactNode {
  switch (section.type) {
    case 'h2':
      return (
        <h2 key={idx} style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '1.5rem', marginBottom: '0.5rem', color: 'var(--color-primary, #3b82f6)', borderBottom: '2px solid var(--color-primary, #3b82f6)', paddingBottom: '0.25rem' }}>
          {section.text}
        </h2>
      );
    case 'h3':
      return (
        <h3 key={idx} style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '1rem', marginBottom: '0.25rem', color: 'var(--color-text, #1f2937)' }}>
          {section.text}
        </h3>
      );
    case 'p':
      return (
        <p key={idx} style={{ margin: '0.5rem 0', lineHeight: 1.7, color: 'var(--color-text, #1f2937)' }}>
          {section.text}
        </p>
      );
    case 'ul':
      return (
        <ul key={idx} style={{ margin: '0.5rem 0 0.5rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {section.items?.map((item, i) => (
            <li key={i} style={{ lineHeight: 1.6, color: 'var(--color-text, #1f2937)' }}>{item}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={idx} style={{ margin: '0.5rem 0 0.5rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {section.items?.map((item, i) => (
            <li key={i} style={{ lineHeight: 1.6, color: 'var(--color-text, #1f2937)' }}>{item}</li>
          ))}
        </ol>
      );
    case 'tip':
      return (
        <div key={idx} style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: '0.75rem 1rem', margin: '1rem 0', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>💡</span>
          <p style={{ margin: 0, color: '#065f46', lineHeight: 1.6, fontSize: '0.9rem' }}>{section.text}</p>
        </div>
      );
    case 'warning':
      return (
        <div key={idx} style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '0.75rem 1rem', margin: '1rem 0', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
          <p style={{ margin: 0, color: '#92400e', lineHeight: 1.6, fontSize: '0.9rem' }}>{section.text}</p>
        </div>
      );
    case 'kbd':
      return (
        <div key={idx} style={{ margin: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {section.shortcuts?.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.3rem 0', borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
              <kbd style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, padding: '0.15rem 0.5rem', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                {s.key}
              </kbd>
              <span style={{ color: 'var(--color-text, #1f2937)', fontSize: '0.9rem' }}>{s.desc}</span>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}
