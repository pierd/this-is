import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs';
import * as use from '@tensorflow-models/universal-sentence-encoder';
import type { MainToWorkerMessage, WordEntry } from './messages';

type WorkerWordEntry = {
  word: string;
  embedding: number[];
  similarities: { [key: string]: number };
}

function wordEntryFromWorkerWordEntry({ word, similarities }: WorkerWordEntry): WordEntry {
  return {
    word,
    similarities
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
};

function calculateAllSimilarities(newEmbedding: number[], existingWords: WorkerWordEntry[]) {
  const similarities: { [key: string]: number } = {};
  existingWords.forEach(entry => {
    similarities[entry.word] = cosineSimilarity(newEmbedding, entry.embedding);
  });
  return similarities;
};

async function main() {
  const wordHistory: WorkerWordEntry[] = [];

  console.log('Initializing TensorFlow backends...');
  await tf.ready();
  console.log('TensorFlow ready, loading Universal Sentence Encoder...');
  const model = await use.load();
  console.log('Model loaded successfully!');
  self.postMessage({ type: 'ready' });

  self.onmessage = async (event) => {
    const message = event.data as MainToWorkerMessage;
    switch (message.type) {
      case 'addWord': {
        const word = message.word;
        try {
          // Get embedding for the current word
          const embeddings = await model.embed([word]);
          const embeddingArray = await embeddings.data();
          const currentEmbedding = Array.from(embeddingArray);

          // Calculate similarities with existing words
          const similarities = calculateAllSimilarities(currentEmbedding, wordHistory);

          // Add current word to history (don't update existing words)
          const newEntry: WorkerWordEntry = {
            word,
            embedding: currentEmbedding,
            similarities
          };
          wordHistory.push(newEntry);
          self.postMessage({ type: 'updated', words: wordHistory.map(wordEntryFromWorkerWordEntry) });

          // Clean up tensor
          embeddings.dispose();
        } catch (error) {
          console.error('Error processing word:', error);
          self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
        }
      }
      break;
      case 'clearHistory': {
        wordHistory.length = 0;
        self.postMessage({ type: 'updated', words: [] });
        break;
      }
    }
  };

}

main().catch((error) => {
  console.error('Error in worker:', error);
  self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
});
