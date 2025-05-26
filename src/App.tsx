import React, { useState, useEffect, useRef } from 'react';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs';
import * as use from '@tensorflow-models/universal-sentence-encoder';
import { Search, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import './App.css';

interface WordEntry {
  word: string;
  embedding: number[];
  timestamp: Date;
  similarities: { [key: string]: number };
}

function App() {
  const [model, setModel] = useState<use.UniversalSentenceEncoder | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentWord, setCurrentWord] = useState('');
  const [wordHistory, setWordHistory] = useState<WordEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showActualSimilarities, setShowActualSimilarities] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadModel = async () => {
      try {
        console.log('Initializing TensorFlow backends...');
        // Wait for TensorFlow to be ready
        await tf.ready();
        console.log('TensorFlow ready, loading Universal Sentence Encoder...');
        const loadedModel = await use.load();
        setModel(loadedModel);
        setLoading(false);
        console.log('Model loaded successfully!');
        // Focus input after model loads
        setTimeout(() => inputRef.current?.focus(), 100);
      } catch (error) {
        console.error('Error loading model:', error);
        setLoading(false);
      }
    };

    loadModel();
  }, []);

  // Auto-focus input on component mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-focus input after processing is complete
  useEffect(() => {
    if (!isProcessing && !loading) {
      // Use setTimeout to ensure focus happens after DOM updates
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [isProcessing, loading]);

  const cosineSimilarity = (a: number[], b: number[]): number => {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  };

  const calculateAllSimilarities = (newEmbedding: number[], existingWords: WordEntry[]) => {
    const similarities: { [key: string]: number } = {};

    // Calculate similarity with all existing words
    existingWords.forEach(entry => {
      similarities[entry.word] = cosineSimilarity(newEmbedding, entry.embedding);
    });

    return similarities;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWord.trim() || !model || isProcessing) return;

    setIsProcessing(true);
    try {
      // Get embedding for the current word
      const embeddings = await model.embed([currentWord.trim()]);
      const embeddingArray = await embeddings.data();
      const currentEmbedding = Array.from(embeddingArray);

      // Calculate similarities with existing words
      const similarities = calculateAllSimilarities(currentEmbedding, wordHistory);

      // Add current word to history (don't update existing words)
      const newEntry: WordEntry = {
        word: currentWord.trim(),
        embedding: currentEmbedding,
        timestamp: new Date(),
        similarities
      };

      setWordHistory(prev => [...prev, newEntry]);

      // Clear input - focus will be handled by useEffect
      setCurrentWord('');

      // Clean up tensor
      embeddings.dispose();
    } catch (error) {
      console.error('Error processing word:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearHistory = () => {
    setWordHistory([]);
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

  if (loading) {
    return (
      <div className="app">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <h2>Loading Universal Sentence Encoder...</h2>
          <p>This may take a moment on first load</p>
        </div>
      </div>
    );
  }

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
              disabled={isProcessing}
            />
            <button
              type="submit"
              disabled={!currentWord.trim() || isProcessing}
              className="submit-button"
            >
              {isProcessing ? 'Naming...' : 'Name it'}
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
                    const topSimilar = getTopSimilarWords(entry.similarities, 2);
                    const mostDifferent = getMostDifferentWords(entry.similarities, 1);
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
                          {topSimilar.length > 0 ? (
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
                          {mostDifferent.length > 0 ? (
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
                          {Object.keys(entry.similarities).length > 0 ? (
                            <div className="similarities-toggle">
                              <button
                                className="toggle-button"
                                onClick={() => toggleRowExpansion(rowIndex)}
                              >
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                {isExpanded ? 'Hide' : 'Show'} Details
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
