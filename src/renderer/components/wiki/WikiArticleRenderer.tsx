import React from 'react';
import type { WikiSection } from './wiki.types';

export function renderSection(section: WikiSection, idx: number): React.ReactNode {
  switch (section.type) {
    case 'h2':
      return (
        <h2 key={idx} className="wiki-article-renderer-1">
          {section.text}
        </h2>
      );
    case 'h3':
      return (
        <h3 key={idx} className="wiki-article-renderer-2">
          {section.text}
        </h3>
      );
    case 'p':
      return (
        <p key={idx} className="wiki-article-renderer-3">
          {section.text}
        </p>
      );
    case 'ul':
      return (
        <ul key={idx} className="wiki-article-renderer-4">
          {section.items?.map((item, i) => (
            <li key={i} className="wiki-article-renderer-5">
              {item}
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={idx} className="wiki-article-renderer-6">
          {section.items?.map((item, i) => (
            <li key={i} className="wiki-article-renderer-5">
              {item}
            </li>
          ))}
        </ol>
      );
    case 'tip':
      return (
        <div key={idx} className="wiki-article-renderer-7">
          <span className="wiki-article-renderer-8">💡</span>
          <p className="wiki-article-renderer-9">{section.text}</p>
        </div>
      );
    case 'warning':
      return (
        <div key={idx} className="wiki-article-renderer-10">
          <span className="wiki-article-renderer-8">⚠️</span>
          <p className="wiki-article-renderer-11">{section.text}</p>
        </div>
      );
    case 'kbd':
      return (
        <div key={idx} className="wiki-article-renderer-12">
          {section.shortcuts?.map((s, i) => (
            <div key={i} className="wiki-article-renderer-13">
              <kbd className="wiki-article-renderer-14">{s.key}</kbd>
              <span className="wiki-article-renderer-15">{s.desc}</span>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}
