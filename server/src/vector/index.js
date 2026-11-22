import { config } from '../config.js';
import { createVectorStore } from './qdrant.js';

export const vectorStore = config.vector.provider === 'qdrant' ? createVectorStore(config.vector) : null;
