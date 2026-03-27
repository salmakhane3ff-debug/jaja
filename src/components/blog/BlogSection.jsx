"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Spinner } from "@heroui/react";
import BlogCard from "./BlogCard";

export default function BlogSection({ 
  title = "Latest Posts", 
  subtitle,
  category = null, 
  limit = 6,
  showViewAll = true,
  variant = "default"
}) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, [category, limit]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/data?collection=Posts");
      const allPosts = await res.json();
      
      let filteredPosts = allPosts.filter(post => post.status === "Published");
      
      // Filter by category if specified
      if (category) {
        filteredPosts = filteredPosts.filter(post => 
          post.category?.toLowerCase() === category.toLowerCase()
        );
      }
      
      // Sort by creation date (newest first)
      filteredPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Limit results
      if (limit) {
        filteredPosts = filteredPosts.slice(0, limit);
      }
      
      setPosts(filteredPosts);
    } catch (error) {
      console.error("Failed to fetch posts:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
          {subtitle && <p className="text-gray-600">{subtitle}</p>}
        </div>
        <div className="flex justify-center">
          <Spinner size="lg" color="default" />
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return null; // Don't render if no posts
  }

  return (
    <section className="py-12">
      {/* Section Header */}
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">{title}</h2>
        {subtitle && (
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">{subtitle}</p>
        )}
      </div>

      {/* Posts Grid */}
      <div className={`grid gap-8 mb-8 ${
        variant === "featured" 
          ? "grid-cols-1" 
          : variant === "compact"
          ? "grid-cols-1 md:grid-cols-2"
          : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
      }`}>
        {posts.map((post) => (
          <BlogCard key={post._id} post={post} variant={variant} />
        ))}
      </div>

      {/* View All Link */}
      {showViewAll && posts.length >= limit && (
        <div className="text-center">
          <Link href="/blog">
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium">
              View All Posts
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        </div>
      )}
    </section>
  );
}