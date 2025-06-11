import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs';
import * as use from '@tensorflow-models/universal-sentence-encoder';
import type { MainToWorkerMessage, WordEntry } from './messages';

class WorkerWordEntry {
  word: string;
  embedding: number[];
  similarities: { [key: string]: number } = {};
  magnitude: number;

  constructor(word: string, embedding: number[], existingWords: WorkerWordEntry[]) {
    this.word = word;
    this.embedding = embedding;
    this.magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    existingWords.forEach(entry => {
      this.similarities[entry.word] = this.cosineSimilarity(entry);
    });
  }

  public toWordEntry(): WordEntry {
    return {
      word: this.word,
      similarities: this.similarities
    }
  }

  public cosineSimilarity(other: WorkerWordEntry): number {
    const dotProduct = this.embedding.reduce((sum, val, i) => sum + val * other.embedding[i], 0);
    return dotProduct / (this.magnitude * other.magnitude);
  };
}

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
          const newEntry = new WorkerWordEntry(word, currentEmbedding, wordHistory);

          // Add current word to history (don't update existing words)
          wordHistory.push(newEntry);
          self.postMessage({ type: 'updated', words: wordHistory.map(wordEntry => wordEntry.toWordEntry()) });

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
