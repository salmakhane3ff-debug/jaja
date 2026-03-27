"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Input, Chip, Pagination, Spinner } from "@heroui/react";
import { Search, Calendar, User, ArrowRight } from "lucide-react";
import formatDate from "@/utils/formatDate";

export default function BlogPage() {
  const [posts, setPosts] = useState([]);
  const [filteredPosts, setFilteredPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const postsPerPage = 6;

  useEffect(() => {
    fetchBlogPosts();
  }, []);

  useEffect(() => {
    filterPosts();
  }, [posts, searchTerm]);

  const fetchBlogPosts = async () => {
    try {
      const res = await fetch("/api/blog");
      const data = await res.json();
      
      const blogPosts = data.filter(post => 
        post.status === "Published"
      ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      setPosts(blogPosts);
    } catch (err) {
      console.error("Failed to fetch blog posts:", err);
    } finally {
      setLoading(false);
    }
  };

  const filterPosts = () => {
    let filtered = posts;

    if (searchTerm) {
      filtered = filtered.filter(post =>
        post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.shortDescription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.content?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredPosts(filtered);
    setPage(1);
  };

  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
  const paginatedPosts = filteredPosts.slice((page - 1) * postsPerPage, page * postsPerPage);

  const truncateContent = (content, maxLength = 150) => {
    if (!content) return "No description available";
    const textContent = content.replace(/<[^>]+>/g, "");
    return textContent.length > maxLength ? textContent.slice(0, maxLength) + "..." : textContent;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <Spinner size="lg" color="primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-gray-50 to-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-light text-gray-900 mb-6 tracking-tight">
              Blog
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Insights, stories, and thoughts on design, technology, and creativity
            </p>
          </div>
          
          {/* Search */}
          <div className="mt-12 max-w-md mx-auto">
            <Input
              placeholder="Search articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              startContent={<Search className="w-4 h-4 text-gray-400" />}
              classNames={{
                base: "bg-white shadow-sm",
                input: "text-gray-900",
                inputWrapper: "border border-gray-200 hover:border-gray-300 focus-within:border-gray-400",
              }}
              radius="lg"
              size="lg"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Results count */}
        <div className="mb-12">
          <p className="text-sm text-gray-500 font-medium">
            {filteredPosts.length} article{filteredPosts.length !== 1 ? 's' : ''}
          </p>
        </div>

        {paginatedPosts.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gray-50 flex items-center justify-center">
              <Search className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">No articles found</h3>
            <p className="text-gray-600">Try adjusting your search terms or browse all articles.</p>
          </div>
        ) : (
          <>
            {/* Featured Post (First post if available) */}
            {paginatedPosts.length > 0 && page === 1 && (
              <div className="mb-20">
                <div className="group cursor-pointer">
                  <Link href={`/blog/${paginatedPosts[0].slug}`}>
                    <article className="grid md:grid-cols-2 gap-12 items-center">
                      <div className="relative overflow-hidden rounded-2xl bg-gray-100 aspect-[4/3]">
                        {paginatedPosts[0].images && paginatedPosts[0].images[0] ? (
                          <img
                            src={paginatedPosts[0].images[0]}
                            alt={paginatedPosts[0].title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="text-6xl text-gray-300">📝</div>
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-6">
                        <div className="space-y-4">
                          {paginatedPosts[0].tags && (
                            <div className="flex flex-wrap gap-2">
                              {paginatedPosts[0].tags.split(',').slice(0, 2).map((tag, index) => (
                                <span key={index} className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
                                  {tag.trim()}
                                </span>
                              ))}
                            </div>
                          )}
                          
                          <h2 className="text-3xl md:text-4xl font-light text-gray-900 leading-tight group-hover:text-gray-600 transition-colors">
                            {paginatedPosts[0].title}
                          </h2>
                          
                          <p className="text-lg text-gray-600 leading-relaxed">
                            {paginatedPosts[0].shortDescription || truncateContent(paginatedPosts[0].content, 200)}
                          </p>
                        </div>
                        
                        <div className="flex items-center justify-between pt-4">
                          <div className="flex items-center gap-6 text-sm text-gray-500">
                            {paginatedPosts[0].author && (
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4" />
                                <span>{paginatedPosts[0].author}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              <span>{formatDate(paginatedPosts[0].createdAt)}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 text-sm font-medium text-gray-900 group-hover:gap-3 transition-all">
                            Read more
                            <ArrowRight className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    </article>
                  </Link>
                </div>
              </div>
            )}

            {/* Article Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
              {paginatedPosts.slice(page === 1 ? 1 : 0).map((post) => (
                <article key={post._id} className="group">
                  <Link href={`/blog/${post.slug}`}>
                    <div className="space-y-6">
                      <div className="relative overflow-hidden rounded-xl bg-gray-50 aspect-[4/3]">
                        {post.images && post.images[0] ? (
                          <img
                            src={post.images[0]}
                            alt={post.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="text-4xl text-gray-300">📝</div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        {post.tags && (
                          <div className="flex flex-wrap gap-1">
                            {post.tags.split(',').slice(0, 2).map((tag, index) => (
                              <span key={index} className="px-2 py-1 text-xs font-medium text-gray-500 bg-gray-50 rounded">
                                {tag.trim()}
                              </span>
                            ))}
                          </div>
                        )}

                        <h3 className="text-xl font-medium text-gray-900 leading-tight group-hover:text-gray-600 transition-colors line-clamp-2">
                          {post.title}
                        </h3>

                        <p className="text-gray-600 leading-relaxed line-clamp-3">
                          {post.shortDescription || truncateContent(post.content)}
                        </p>

                        <div className="flex items-center gap-4 text-xs text-gray-500 pt-2">
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
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center mt-20">
            <Pagination
              total={totalPages}
              page={page}
              onChange={setPage}
              showControls
              classNames={{
                wrapper: "gap-2",
                item: "bg-transparent border border-gray-200 text-gray-600 hover:bg-gray-50",
                cursor: "bg-gray-900 text-white shadow-md",
              }}
              radius="lg"
            />
          </div>
        )}
      </div>
    </div>
  );
}
