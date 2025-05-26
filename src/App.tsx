import React, { useState, useEffect, useRef } from 'react';
import { Search, Trash2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { type WordEntry, type WorkerToMainMessage } from './messages.ts';
import workerInit from './worker.ts?worker';
import './App.css';

type MainWordEntry = WordEntry & {
  processing: boolean;
}

function App() {
  const [loading, setLoading] = useState(true);
  const [currentWord, setCurrentWord] = useState('');
  const [wordHistory, setWordHistory] = useState<MainWordEntry[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showActualSimilarities, setShowActualSimilarities] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new workerInit();
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const message = event.data as WorkerToMainMessage;
      switch (message.type) {
        case 'error':
          console.error('Worker error (from message):', message.error);
          break;
        case 'ready':
          setLoading(false);
          break;
        case 'updated':
          setWordHistory(message.words.map(word => ({
            ...word,
            processing: false
          })));
          break;
      }
    };

    worker.onerror = (event) => {
      console.error('Worker error (from event):', event);
    };
  }, []);

  // Auto-focus input on component mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-focus input after processing is complete
  useEffect(() => {
    if (!loading) {
      // Use setTimeout to ensure focus happens after DOM updates
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const word = currentWord.trim();
    if (!word) return;

    workerRef.current?.postMessage({ type: 'addWord', word });
    const newEntry: MainWordEntry = {
      word,
      similarities: {},
      processing: true
    };
    setWordHistory(prev => [...prev, newEntry]);
    setCurrentWord('');
  };

  const clearHistory = () => {
    workerRef.current?.postMessage({ type: 'clearHistory' });
  };

  const getRelativeSimilarity = (similarity: number, allSimilarities: number[]): number => {
    if (allSimilarities.length === 0) return 0;
    const min = Math.min(...allSimilarities);
    const max = 1.0;
    if (max === min) return 0.5; // If all values are the same, return middle value
    return (similarity - min) / (max - min);
  };

  const formatSimilarity = (similarity: number, allSimilarities: number[]): string => {
    const relativeSimilarity = getRelativeSimilarity(similarity, allSimilarities);
    return (relativeSimilarity * 100).toFixed(1) + '%';
  };

  const getSimilarityColor = (similarity: number, allSimilarities: number[]): string => {
    const relativeSimilarity = getRelativeSimilarity(similarity, allSimilarities);
    if (relativeSimilarity < 0.25) return '#22c55e'; // green - very different (good)
    if (relativeSimilarity < 0.5) return '#eab308'; // yellow - moderately different
    if (relativeSimilarity < 0.75) return '#f97316'; // orange - somewhat similar
    return '#ef4444'; // red - very similar (bad)
  };

  const getTopSimilarWords = (similarities: { [key: string]: number }, count: number = 2): { word: string; similarity: number }[] => {
    const entries = Object.entries(similarities);
    if (entries.length === 0) return [];

    return entries
      .sort(([, a], [, b]) => b - a)
      .slice(0, count)
      .map(([word, similarity]) => ({ word, similarity }));
  };

  const getMostDifferentWords = (similarities: { [key: string]: number }, count: number = 1): { word: string; similarity: number }[] => {
    const entries = Object.entries(similarities);
    if (entries.length === 0) return [];

    return entries
      .sort(([, a], [, b]) => a - b)
      .slice(0, count)
      .map(([word, similarity]) => ({ word, similarity }));
  };

  const isWordRepeated = (word: string, currentIndex: number): boolean => {
    return wordHistory
      .slice(0, currentIndex)
      .some(entry => entry.word.toLowerCase() === word.toLowerCase());
  };

  const toggleRowExpansion = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const handleSimilarityClick = () => {
    setShowActualSimilarities(!showActualSimilarities);
  };

  const renderSimilarityBadge = (similarity: number, allSimilarities: number[]) => {
    return (
      <span
        className="similarity-badge"
        style={{ backgroundColor: getSimilarityColor(similarity, allSimilarities) }}
        title={`Actual similarity: ${similarity.toFixed(3)}`}
        onClick={handleSimilarityClick}
      >
        {showActualSimilarities ? similarity.toFixed(3) : formatSimilarity(similarity, allSimilarities)}
      </span>
    );
  };

  const allSimilarities = wordHistory.flatMap(entry => Object.values(entry.similarities));

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>This is...</h1>
        </header>

        <form onSubmit={handleSubmit} className="input-form">
          <div className="input-group">
            <span className="this-is-prefix">This is a/an/the</span>
            <input
              ref={inputRef}
              type="text"
              value={currentWord}
              onChange={(e) => setCurrentWord(e.target.value)}
              placeholder="thing"
              className="word-input"
              disabled={loading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              inputMode="text"
            />
            <button
              type="submit"
              disabled={!currentWord.trim() || loading}
              className="submit-button"
            >
              {loading ? 'Loading...' : 'Name it'}
            </button>
          </div>
        </form>

        {wordHistory.length > 0 && (
          <div className="words-table-section">
            <div className="table-container">
              <table className="words-table">
                <thead>
                  <tr>
                    <th style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Thing ({wordHistory.length})
                      <button onClick={clearHistory} className="clear-button">
                        <Trash2 size={16} />
                      </button>
                    </th>
                    <th>Most Similar To</th>
                    <th>Most Different From</th>
                    <th>Similarities</th>
                  </tr>
                </thead>
                <tbody>
                  {wordHistory.slice().reverse().map((entry, index) => {
                    const processing = entry.processing;
                    const topSimilar = processing ? [] : getTopSimilarWords(entry.similarities, 2);
                    const mostDifferent = processing ? [] : getMostDifferentWords(entry.similarities, 1);
                    const rowIndex = wordHistory.length - 1 - index;
                    const isExpanded = expandedRows.has(rowIndex);

                    return (
                      <tr key={rowIndex} className="word-row">
                        <td className="word-cell">
                          <span className={`word-text ${isWordRepeated(entry.word, rowIndex) ? 'repeated-word' : ''}`}>
                            {entry.word}
                          </span>
                        </td>
                        <td className="most-similar-cell">
                          {processing ? (
                            <span className="no-data"><Loader2 size={16} className="animate-spin" /></span>
                          ) : topSimilar.length > 0 ? (
                            <div className="similar-words">
                              {topSimilar.map(({ word, similarity }, idx) => (
                                <div key={idx} className="most-similar">
                                  <span className="similar-word">{word}</span>
                                  {renderSimilarityBadge(similarity, allSimilarities)}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="no-data">-</span>
                          )}
                        </td>
                        <td className="most-different-cell">
                          {processing ? (
                            <span className="no-data"><Loader2 size={16} className="animate-spin" /></span>
                          ) : mostDifferent.length > 0 ? (
                            <div className="different-words">
                              {mostDifferent.map(({ word, similarity }, idx) => (
                                <div key={idx} className="most-different">
                                  <span className="different-word">{word}</span>
                                  {renderSimilarityBadge(similarity, allSimilarities)}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="no-data">-</span>
                          )}
                        </td>
                        <td className="similarities-cell">
                          {processing ? (
                            <span className="no-data"><Loader2 size={16} className="animate-spin" /></span>
                          ) : Object.keys(entry.similarities).length > 0 ? (
                            <div className="similarities-toggle">
                              <button
                                className="toggle-button"
                                onClick={() => toggleRowExpansion(rowIndex)}
                              >
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                {isExpanded ? 'Hide' : 'Show'}
                              </button>
                              {isExpanded && (
                                <div className="similarities-list">
                                  {Object.entries(entry.similarities)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([word, similarity]) => (
                                      <div key={word} className="similarity-item">
                                        <span className="similarity-word">{word}</span>
                                        {renderSimilarityBadge(similarity, allSimilarities)}
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="no-data">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {wordHistory.length === 0 && (
          <div className="empty-state">
            <Search size={48} />
            <h3>Nothing named yet</h3>
            <p>Start by naming your first thing!</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
