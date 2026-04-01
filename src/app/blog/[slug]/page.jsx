"use client";

// PERF: prose.css scoped to this route — not loaded on the storefront or checkout.
import "@/app/prose.css";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Chip, Spinner, Button } from "@heroui/react";
import { Calendar, User, ArrowLeft, Share2 } from "lucide-react";
import formatDate from "@/utils/formatDate";

export default function BlogPostPage() {
  const params = useParams();
  const { slug } = params;
  const [post, setPost] = useState(null);
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slug) {
      fetchPost();
    }
  }, [slug]);

  const fetchPost = async () => {
    try {
      const res = await fetch("/api/blog");
      const data = await res.json();
      
      const foundPost = data.find(p => p.slug === slug && p.status === "Published");
      setPost(foundPost || null);

      // Get related posts (same tags, excluding current post)
      if (foundPost) {
        const postTags = foundPost.tags ? foundPost.tags.split(',').map(tag => tag.trim()) : [];
        const related = data
          .filter(p => 
            p._id !== foundPost._id && 
            p.status === "Published" &&
            p.tags && postTags.some(tag => p.tags.includes(tag))
          )
          .slice(0, 3);
        setRelatedPosts(related);
      }
    } catch (err) {
      console.error("Failed to fetch post:", err);
    } finally {
      setLoading(false);
    }
  };

  const sharePost = () => {
    if (navigator.share) {
      navigator.share({
        title: post.title,
        text: post.shortDescription || post.title,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Link copied to clipboard!");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <Spinner size="lg" color="primary" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Post not found</h1>
          <p className="text-gray-600 mb-6">The blog post you're looking for doesn't exist.</p>
          <Link href="/blog">
            <Button color="primary">Back to Blog</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <Link href="/blog" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to Blog
        </Link>

        {/* Article Header */}
        <article className="bg-white rounded-xl shadow-sm overflow-hidden mb-12">
          {/* Featured Image */}
          {post.images && post.images[0] && (
            <div className="relative h-64 md:h-96 bg-gray-200">
              <img
                src={post.images[0]}
                alt={post.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="p-8">
            {/* Tags */}
            {post.tags && (
              <div className="flex flex-wrap gap-2 mb-4">
                {post.tags.split(',').map((tag, index) => (
                  <Chip key={index} size="sm" variant="flat" color="primary">
                    {tag.trim()}
                  </Chip>
                ))}
              </div>
            )}

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {post.title}
            </h1>

            {/* Short Description */}
            {post.shortDescription && (
              <p className="text-xl text-gray-600 mb-6 leading-relaxed">
                {post.shortDescription}
              </p>
            )}

            {/* Meta Information */}
            <div className="flex items-center justify-between border-b border-gray-200 pb-6 mb-8">
              <div className="flex items-center gap-6 text-sm text-gray-600">
                {post.author && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span>{post.author}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(post.createdAt)}</span>
                </div>
              </div>

              <Button
                variant="light"
                size="sm"
                startContent={<Share2 className="w-4 h-4" />}
                onPress={sharePost}
              >
                Share
              </Button>
            </div>

            {/* Content */}
            <div 
              className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-blue-600"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          </div>
        </article>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Related Articles</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedPosts.map((relatedPost) => (
                <Link key={relatedPost._id} href={`/blog/${relatedPost.slug}`}>
                  <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-4">
                    {relatedPost.images && relatedPost.images[0] && (
                      <img
                        src={relatedPost.images[0]}
                        alt={relatedPost.title}
                        className="w-full h-32 object-cover rounded-lg mb-3"
                      />
                    )}
                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                      {relatedPost.title}
                    </h3>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {relatedPost.shortDescription || ""}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Back to Blog */}
        <div className="text-center">
          <Link href="/blog">
            <Button color="primary" variant="bordered">
              View All Articles
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
