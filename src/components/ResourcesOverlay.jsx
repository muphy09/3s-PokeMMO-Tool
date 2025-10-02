import React, { useState } from 'react';
import resourcesData from '../data/resources.json';

export default function ResourcesOverlay({ onClose }) {
  const [selectedCategory, setSelectedCategory] = useState(resourcesData.categories[0].id);

  const currentCategory = resourcesData.categories.find(cat => cat.id === selectedCategory);

  // Parse markdown-style formatting for bold text
  const formatText = (text) => {
    if (!text) return null;

    // Split by bold markers and format
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Parse text into paragraphs and lists
  const parseContent = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];
    let currentList = [];

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('•')) {
        // List item
        currentList.push(
          <li key={`li-${idx}`}>{formatText(trimmed.slice(1).trim())}</li>
        );
      } else if (trimmed === '') {
        // Empty line - close current list if any, then add paragraph break
        if (currentList.length > 0) {
          elements.push(<ul key={`ul-${idx}`} className="resource-list">{currentList}</ul>);
          currentList = [];
        }
      } else {
        // Regular paragraph
        if (currentList.length > 0) {
          elements.push(<ul key={`ul-${idx}`} className="resource-list">{currentList}</ul>);
          currentList = [];
        }
        elements.push(<p key={`p-${idx}`}>{formatText(trimmed)}</p>);
      }
    });

    // Close any remaining list
    if (currentList.length > 0) {
      elements.push(<ul key="ul-final" className="resource-list">{currentList}</ul>);
    }

    return elements;
  };

  return (
    <div className="resources-overlay">
      <div className="resources-container">
        {/* Header */}
        <div className="resources-header">
          <h2>PokeMMO Resources & Guides</h2>
          <button className="resources-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Main Content Area */}
        <div className="resources-content">
          {/* Sidebar with categories */}
          <div className="resources-sidebar">
            <nav className="resources-nav">
              {resourcesData.categories.map(category => (
                <button
                  key={category.id}
                  className={`resources-nav-item ${selectedCategory === category.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.title}
                </button>
              ))}
            </nav>

            <div className="resources-footer">
              <p className="resources-footer-text">
                Information compiled from{' '}
                <a
                  href="https://forums.pokemmo.com/index.php?/forum/26-guide-tavern/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="resources-link"
                >
                  Guide Tavern
                </a>
              </p>
            </div>
          </div>

          {/* Content panel */}
          <div className="resources-panel">
            <div className="resources-panel-inner">
              <h3 className="resources-category-title">{currentCategory.title}</h3>

              <div className="resources-sections">
                {currentCategory.sections.map((section, idx) => (
                  <div key={idx} className="resource-section">
                    <h4 className="resource-section-heading">{section.heading}</h4>
                    <div className="resource-section-content">
                      {parseContent(section.content)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
