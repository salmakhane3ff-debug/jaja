"use client";

import Link from "next/link";
import { Chip } from "@heroui/react";
import { Calendar, User, ArrowRight, Tag } from "lucide-react";
import formatDate from "@/utils/formatDate";

export default function BlogCard({ post, variant = "default" }) {
  const extractTextFromHTML = (html) => {
    if (!html) return "";
    return html.replace(/<[^>]+>/g, "").slice(0, 150) + "...";
  };

  const getBlogPath = (post) => {
    if (post.category?.toLowerCase() === "page") {
      return `/pages/${post.slug}`;
    }
    return `/blog/${post.slug}`;
  };

  if (variant === "compact") {
    return (
      <article className="flex gap-4 p-4 bg-white rounded-lg border border-gray-100 hover:shadow-md transition-shadow">
        {/* Thumbnail */}
        <Link href={getBlogPath(post)} className="flex-shrink-0">
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
            <img
              src={post.images?.[0] || "https://placehold.co/200x200?text=No+Image"}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
        </Link>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <Link href={getBlogPath(post)}>
            <h3 className="font-medium text-gray-900 hover:text-gray-700 transition-colors line-clamp-2 mb-2">
              {post.title}
            </h3>
          </Link>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{formatDate(post.createdAt)}</span>
            {post.author && <span>by {post.author}</span>}
          </div>
        </div>
      </article>
    );
  }

  if (variant === "featured") {
    return (
      <article className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Featured Image */}
        <Link href={getBlogPath(post)}>
          <div className="aspect-[16/9] overflow-hidden bg-gray-100">
            <img
              src={post.images?.[0] || "https://placehold.co/800x450?text=No+Image"}
              alt={post.title}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
            />
          </div>
        </Link>

        <div className="p-8">
          {/* Category Badge */}
          {post.category && (
            <div className="mb-4">
              <Chip
                size="md"
                variant="flat"
                color={post.category.toLowerCase() === "blog" ? "primary" : "secondary"}
                startContent={<Tag className="w-4 h-4" />}
              >
                {post.category}
              </Chip>
            </div>
          )}

          {/* Title */}
          <Link href={getBlogPath(post)}>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 hover:text-gray-700 transition-colors line-clamp-2">
              {post.title}
            </h2>
          </Link>

          {/* Description */}
          <p className="text-gray-600 mb-6 line-clamp-3">
            {post.shortDescription || extractTextFromHTML(post.content)}
          </p>

          {/* Meta and CTA */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {post.author && (
                <div className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  <span>{post.author}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(post.createdAt)}</span>
              </div>
            </div>

            <Link href={getBlogPath(post)}>
              <div className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
                Read More
                <ArrowRight className="w-4 h-4" />
              </div>
            </Link>
          </div>
        </div>
      </article>
    );
  }

  // Default variant
  return (
    <article className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow duration-300">
      {/* Featured Image */}
      <Link href={getBlogPath(post)}>
        <div className="aspect-video overflow-hidden bg-gray-100">
          <img
            src={post.images?.[0] || "https://placehold.co/600x400?text=No+Image"}
            alt={post.title}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
          />
        </div>
      </Link>

      <div className="p-6">
        {/* Category Badge */}
        {post.category && (
          <div className="mb-3">
            <Chip
              size="sm"
              variant="flat"
              color={post.category.toLowerCase() === "blog" ? "primary" : "secondary"}
              startContent={<Tag className="w-3 h-3" />}
            >
              {post.category}
            </Chip>
          </div>
        )}

        {/* Title */}
        <Link href={getBlogPath(post)}>
          <h2 className="text-xl font-semibold text-gray-900 mb-3 hover:text-gray-700 transition-colors line-clamp-2">
            {post.title}
          </h2>
        </Link>

        {/* Description */}
        <p className="text-gray-600 text-sm mb-4 line-clamp-3">
          {post.shortDescription || extractTextFromHTML(post.content)}
        </p>

        {/* Meta Information */}
        <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
          <div className="flex items-center gap-4">
            {post.author && (
              <div className="flex items-center gap-1">
                <User className="w-3 h-3" />
                <span>{post.author}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{formatDate(post.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Tags */}
        {post.tags && (
          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.split(",").slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full"
              >
                {tag.trim()}
              </span>
            ))}
          </div>
        )}

        {/* Read More Link */}
        <Link href={getBlogPath(post)}>
          <div className="inline-flex items-center gap-2 text-sm font-medium text-gray-900 hover:text-gray-700 transition-colors">
            Read More
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>
      </div>
    </article>
  );
}