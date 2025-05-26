export type MainToWorkerMessage = {
  type: 'addWord';
  word: string;
} | {
  type: 'clearHistory';
};

export type WorkerToMainMessage = {
  type: 'error';
  error: string;
} | {
  type: 'ready';
} | {
  type: 'updated';
  words: WordEntry[];
};

export type WordEntry = {
  word: string;
  similarities: { [key: string]: number };
}
