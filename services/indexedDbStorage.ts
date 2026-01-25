/**
 * IndexedDB 视频存储服务
 * 用于存储和管理视频数据
 */

interface VideoMetadata {
  id: string;
  nodeId: string;
  nodeType: string;
  videoUri: string; // 原始URL或base64
  videoBlob?: Blob;
  mimeType: string;
  size: number;
  createdAt: number;
  prompt?: string;
  videoMetadata?: any;
}

interface StoredVideo {
  id: string;
  nodeId: string;
  nodeType: string;
  videoData: Blob; // 存储实际的二进制数据
  metadata: VideoMetadata;
}

class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'ManJuVideoDB';
  private readonly DB_VERSION = 1;
  private readonly STORE_NAME = 'videos';

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    if (this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error('[IndexedDBStorage] 打开数据库失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDBStorage] 数据库打开成功');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建视频存储对象仓库
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const objectStore = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });

          // 创建索引
          objectStore.createIndex('nodeId', 'metadata.nodeId', { unique: false });
          objectStore.createIndex('nodeType', 'metadata.nodeType', { unique: false });
          objectStore.createIndex('createdAt', 'metadata.createdAt', { unique: false });

          console.log('[IndexedDBStorage] 对象仓库创建成功');
        }
      };
    });
  }

  /**
   * 保存视频到数据库
   * @param id 视频ID
   * @param nodeId 节点ID
   * @param nodeType 节点类型
   * @param videoUri 视频URI（URL或base64）
   * @param metadata 其他元数据
   */
  async saveVideo(
    id: string,
    nodeId: string,
    nodeType: string,
    videoUri: string,
    metadata?: Partial<VideoMetadata>
  ): Promise<void> {
    await this.init();

    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    try {
      // 如果是base64，转换为Blob
      let videoBlob: Blob;
      if (videoUri.startsWith('data:')) {
        videoBlob = await this.dataUriToBlob(videoUri);
      } else if (videoUri.startsWith('blob:')) {
        // 已经是blob URL，需要获取Blob
        videoBlob = await this.blobUrlToBlob(videoUri);
      } else {
        // 是远程URL，需要下载
        videoBlob = await this.fetchVideoBlob(videoUri);
      }

      const storedVideo: StoredVideo = {
        id,
        nodeId,
        nodeType,
        videoData: videoBlob,
        metadata: {
          id,
          nodeId,
          nodeType,
          videoUri,
          videoBlob,
          mimeType: videoBlob.type || 'video/mp4',
          size: videoBlob.size,
          createdAt: Date.now(),
          ...metadata
        }
      };

      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(this.STORE_NAME);
      const request = objectStore.put(storedVideo);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          console.log('[IndexedDBStorage] 视频保存成功:', id);
          resolve();
        };
        request.onerror = () => {
          console.error('[IndexedDBStorage] 视频保存失败:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[IndexedDBStorage] 保存视频时出错:', error);
      throw error;
    }
  }

  /**
   * 从数据库获取视频
   * @param id 视频ID
   * @returns Blob URL
   */
  async getVideo(id: string): Promise<string | null> {
    await this.init();

    if (!this.db) {
      console.error('[IndexedDBStorage] 数据库未初始化');
      return null;
    }

    console.log('[IndexedDBStorage] 📥 查询视频，ID:', id);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(this.STORE_NAME);
      const request = objectStore.get(id);

      request.onsuccess = () => {
        const result = request.result as StoredVideo | undefined;
        if (result) {
          // 创建Blob URL
          const blobUrl = URL.createObjectURL(result.videoData);
          console.log('[IndexedDBStorage] ✅ 视频读取成功:', {
              id,
              blobSize: result.videoData.size,
              blobType: result.videoData.type
          });
          resolve(blobUrl);
        } else {
          console.warn('[IndexedDBStorage] ⚠️ 视频未找到:', id);
          console.log('[IndexedDBStorage] 💡 提示: 检查所有存储的视频ID...');
          // 列出所有存储的视频ID用于调试
          const getAllRequest = objectStore.getAll();
          getAllRequest.onsuccess = () => {
              const allVideos = getAllRequest.result as StoredVideo[];
              console.log('[IndexedDBStorage] 📋 所有存储的视频:', allVideos.map(v => ({
                  id: v.id,
                  nodeId: v.metadata.nodeId,
                  size: v.videoData.size
              })));
          };
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('[IndexedDBStorage] ❌ 视频读取失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 根据nodeId获取所有相关视频
   * @param nodeId 节点ID
   * @returns 视频列表
   */
  async getVideosByNode(nodeId: string): Promise<StoredVideo[]> {
    await this.init();

    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(this.STORE_NAME);
      const index = objectStore.index('nodeId');
      const request = index.getAll(nodeId);

      request.onsuccess = () => {
        const results = request.result as StoredVideo[];
        console.log('[IndexedDBStorage] 找到', results.length, '个视频');
        resolve(results);
      };

      request.onerror = () => {
        console.error('[IndexedDBStorage] 查询视频失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 删除视频
   * @param id 视频ID
   */
  async deleteVideo(id: string): Promise<void> {
    await this.init();

    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(this.STORE_NAME);
      const request = objectStore.delete(id);

      request.onsuccess = () => {
        console.log('[IndexedDBStorage] 视频删除成功:', id);
        resolve();
      };

      request.onerror = () => {
        console.error('[IndexedDBStorage] 视频删除失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 删除节点的所有视频
   * @param nodeId 节点ID
   */
  async deleteVideosByNode(nodeId: string): Promise<void> {
    const videos = await this.getVideosByNode(nodeId);

    for (const video of videos) {
      await this.deleteVideo(video.id);
    }
  }

  /**
   * 清空所有视频
   */
  async clearAll(): Promise<void> {
    await this.init();

    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(this.STORE_NAME);
      const request = objectStore.clear();

      request.onsuccess = () => {
        console.log('[IndexedDBStorage] 所有视频已清空');
        resolve();
      };

      request.onerror = () => {
        console.error('[IndexedDBStorage] 清空失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 获取数据库使用情况
   */
  async getStorageInfo(): Promise<{ count: number; totalSize: number }> {
    await this.init();

    if (!this.db) {
      return { count: 0, totalSize: 0 };
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(this.STORE_NAME);
      const request = objectStore.getAll();

      request.onsuccess = () => {
        const results = request.result as StoredVideo[];
        const totalSize = results.reduce((sum, video) => sum + video.videoData.size, 0);
        resolve({
          count: results.length,
          totalSize
        });
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * 辅助函数：将data URI转换为Blob
   */
  private async dataUriToBlob(dataUri: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const arr = dataUri.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'video/mp4';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);

      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }

      resolve(new Blob([u8arr], { type: mime }));
    });
  }

  /**
   * 辅助函数：将blob URL转换为Blob
   */
  private async blobUrlToBlob(blobUrl: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      fetch(blobUrl)
        .then(res => res.blob())
        .then(blob => resolve(blob))
        .catch(err => reject(err));
    });
  }

  /**
   * 辅助函数：从远程URL获取视频Blob
   */
  private async fetchVideoBlob(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`);
    }
    return await response.blob();
  }
}

// 导出单例
export const indexedDbStorage = new IndexedDBStorage();

/**
 * 便捷函数：保存视频
 */
export async function saveVideoToIndexedDB(
  nodeId: string,
  nodeType: string,
  videoUri: string,
  metadata?: Partial<VideoMetadata>
): Promise<string> {
  const id = `${nodeId}-${Date.now()}`;
  await indexedDbStorage.saveVideo(id, nodeId, nodeType, videoUri, metadata);
  return id;
}

/**
 * 便捷函数：加载视频
 */
export async function loadVideoFromIndexedDB(id: string): Promise<string | null> {
  return await indexedDbStorage.getVideo(id);
}

/**
 * 便捷函数：加载节点的所有视频
 */
export async function loadNodeVideosFromIndexedDB(nodeId: string): Promise<Map<string, string>> {
  const videos = await indexedDbStorage.getVideosByNode(nodeId);
  const videoMap = new Map<string, string>();

  for (const video of videos) {
    const blobUrl = URL.createObjectURL(video.videoData);
    videoMap.set(video.id, blobUrl);
  }

  return videoMap;
}
