'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useMemo, useRef, useState } from 'react';

type UploadedImage = {
  id: string;
  name: string;
  previewUrl: string;
  status: 'uploading' | 'uploaded' | 'error';
  url?: string;
};

type CreatePostResponse = {
  id: string;
};

type UploadImageResponse = {
  url: string;
};

const MAX_IMAGE_COUNT = 9;

export default function CommunityCreatePostClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const imageSlotsText = useMemo(() => {
    return `${uploadedImages.filter(image => image.status === 'uploaded').length}/${MAX_IMAGE_COUNT}`;
  }, [uploadedImages]);

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    const availableCount = Math.max(0, MAX_IMAGE_COUNT - uploadedImages.length);
    if (availableCount === 0) {
      setFeedbackMessage(`最多只能上传 ${MAX_IMAGE_COUNT} 张图片。`);
      event.target.value = '';
      return;
    }

    const filesToUpload = selectedFiles.slice(0, availableCount);
    setFeedbackMessage('');

    for (const file of filesToUpload) {
      const localId = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(file);

      setUploadedImages(previous => [
        ...previous,
        {
          id: localId,
          name: file.name,
          previewUrl,
          status: 'uploading',
        },
      ]);

      try {
        const payload = await buildUploadPayload(file);
        const response = await fetch('/api/community/uploads/images', {
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });

        if (!response.ok) {
          throw new Error('upload failed');
        }

        const result = (await response.json()) as UploadImageResponse;
        setUploadedImages(previous =>
          previous.map(image =>
            image.id === localId
              ? {
                  ...image,
                  status: 'uploaded',
                  url: result.url,
                }
              : image,
          ),
        );
      } catch {
        setUploadedImages(previous =>
          previous.map(image =>
            image.id === localId
              ? {
                  ...image,
                  status: 'error',
                }
              : image,
          ),
        );
        setFeedbackMessage('有图片上传失败了，你可以移除失败图片后继续发帖。');
      }
    }

    event.target.value = '';
  }

  async function handleSubmitPost() {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const hasUploadingImage = uploadedImages.some(image => image.status === 'uploading');
    const imageUrls = uploadedImages
      .filter(image => image.status === 'uploaded' && image.url)
      .map(image => image.url as string);

    if (!trimmedTitle || !trimmedContent) {
      setFeedbackMessage('请先填写标题和正文。');
      return;
    }

    if (hasUploadingImage) {
      setFeedbackMessage('还有图片正在上传，请稍等一下再发布。');
      return;
    }

    if (uploadedImages.some(image => image.status === 'error')) {
      setFeedbackMessage('请先移除上传失败的图片，再发布帖子。');
      return;
    }

    setIsSubmitting(true);
    setFeedbackMessage('');

    try {
      const response = await fetch('/api/community/posts', {
        body: JSON.stringify({
          content: trimmedContent,
          imageUrls,
          title: trimmedTitle,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || '发布失败，请稍后重试。');
      }

      const post = (await response.json()) as CreatePostResponse;
      router.push(`/community/post/${post.id}`);
      router.refresh();
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error && error.message ? error.message : '发布失败，请稍后重试。',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRemoveImage(imageId: string) {
    setUploadedImages(previous => {
      const targetImage = previous.find(image => image.id === imageId);
      if (targetImage) {
        URL.revokeObjectURL(targetImage.previewUrl);
      }

      return previous.filter(image => image.id !== imageId);
    });
  }

  return (
    <div className="forum-form-wrap">
      <p className="forum-board-intro">
        现在这版 Web 发帖已经会直接调用 community-api。你在这里发出的帖子，会和手机端共用
        同一份 MySQL 社区数据。
      </p>

      <form
        className="forum-publish-form"
        onSubmit={event => {
          event.preventDefault();
          handleSubmitPost().catch(() => {
            setFeedbackMessage('发布失败，请稍后重试。');
          });
        }}
      >
        <label htmlFor="title">标题</label>
        <input
          id="title"
          placeholder="例如：我如何把夜景素材调成更有呼吸感的冷暖结构"
          value={title}
          onChange={event => setTitle(event.target.value)}
        />

        <label htmlFor="content">正文</label>
        <textarea
          id="content"
          placeholder="写下你的创作思路、遇到的问题、过程截图说明，或你想邀请社区一起讨论的内容"
          value={content}
          onChange={event => setContent(event.target.value)}
        />

        <div className="forum-upload-header">
          <label htmlFor="images">上传图片</label>
          <span className="forum-upload-count">已上传 {imageSlotsText}</span>
        </div>

        <input
          ref={fileInputRef}
          id="images"
          className="forum-file-input"
          type="file"
          accept="image/*"
          multiple
          onChange={event => {
            handleFileSelection(event).catch(() => {
              setFeedbackMessage('图片处理失败，请重新选择。');
            });
          }}
        />

        <div className="forum-upload-dropzone">
          <div className="forum-upload-copy">
            <strong>选择本地图片上传</strong>
            <span>支持 JPG、PNG、WEBP，最多 9 张。上传完成后会立即进入社区后端。</span>
          </div>
          <button
            className="forum-action-button forum-action-primary"
            type="button"
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            选择图片
          </button>
        </div>

        {uploadedImages.length > 0 ? (
          <div className="forum-upload-grid">
            {uploadedImages.map(image => (
              <article key={image.id} className="forum-upload-card">
                <div className="forum-upload-preview">
                  <Image
                    src={image.previewUrl}
                    alt={image.name}
                    fill
                    sizes="(max-width: 720px) 100vw, 220px"
                    unoptimized
                  />
                </div>
                <div className="forum-upload-meta">
                  <strong title={image.name}>{image.name}</strong>
                  <span
                    className={[
                      'forum-upload-status',
                      image.status === 'uploaded'
                        ? 'forum-upload-status-success'
                        : image.status === 'error'
                          ? 'forum-upload-status-error'
                          : 'forum-upload-status-pending',
                    ].join(' ')}
                  >
                    {image.status === 'uploaded'
                      ? '上传成功'
                      : image.status === 'error'
                        ? '上传失败'
                        : '上传中'}
                  </span>
                </div>
                <button
                  className="forum-upload-remove"
                  type="button"
                  onClick={() => {
                    handleRemoveImage(image.id);
                  }}
                >
                  移除
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="forum-empty-state">
            <strong>还没有上传图片</strong>
            <span>你可以先发纯文字帖子，也可以先上传一组图片再发布。</span>
          </div>
        )}

        {feedbackMessage ? <p className="bili-feedback-message">{feedbackMessage}</p> : null}

        <div className="forum-button-row">
          <button
            className="forum-action-button forum-action-primary"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? '发布中' : '发布帖子'}
          </button>
          <button
            className="forum-action-button"
            type="button"
            onClick={() => {
              router.push('/community');
            }}
          >
            返回社区首页
          </button>
        </div>
      </form>
    </div>
  );
}

async function buildUploadPayload(file: File) {
  const dataUrl = await readFileAsDataUrl(file);
  const dimensions = await readImageDimensions(dataUrl);

  return {
    dataBase64: dataUrl.split(',')[1] ?? '',
    filename: file.name,
    height: dimensions.height,
    mimeType: file.type || 'application/octet-stream',
    width: dimensions.width,
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Failed to read file.'));
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file.'));
    };

    reader.readAsDataURL(file);
  });
}

function readImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new window.Image();

    image.onload = () => {
      resolve({
        height: image.naturalHeight || 900,
        width: image.naturalWidth || 1200,
      });
    };

    image.onerror = () => {
      reject(new Error('Failed to parse image.'));
    };

    image.src = dataUrl;
  });
}
