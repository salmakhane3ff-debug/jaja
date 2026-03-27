"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Input, Pagination, Spinner } from "@heroui/react";
import { Search, FileText, Calendar, ArrowRight } from "lucide-react";
import formatDate from "@/utils/formatDate";

export default function PagesPage() {
  const [pages, setPages] = useState([]);
  const [filteredPages, setFilteredPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const pagesPerPage = 12;

  useEffect(() => {
    fetchPages();
  }, []);

  useEffect(() => {
    filterPages();
  }, [pages, searchTerm]);

  const fetchPages = async () => {
    try {
      const res = await fetch("/api/pages");
      const data = await res.json();
      
      // Filter only Published status
      const pageData = data.filter(post => 
        post.status === "Published"
      ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      setPages(pageData);
    } catch (err) {
      console.error("Failed to fetch pages:", err);
    } finally {
      setLoading(false);
    }
  };

  const filterPages = () => {
    let filtered = pages;

    if (searchTerm) {
      filtered = filtered.filter(page =>
        page.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        page.shortDescription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        page.content?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredPages(filtered);
    setPage(1);
  };

  const totalPages = Math.ceil(filteredPages.length / pagesPerPage);
  const paginatedPages = filteredPages.slice((page - 1) * pagesPerPage, page * pagesPerPage);

  const truncateContent = (content, maxLength = 120) => {
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
              Pages
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Important information and company pages you need to know
            </p>
          </div>
          
          {/* Search */}
          <div className="mt-12 max-w-md mx-auto">
            <Input
              placeholder="Search pages..."
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
            {filteredPages.length} page{filteredPages.length !== 1 ? 's' : ''}
          </p>
        </div>

        {paginatedPages.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gray-50 flex items-center justify-center">
              <FileText className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">No pages found</h3>
            <p className="text-gray-600">Try adjusting your search terms or browse all pages.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {paginatedPages.map((pageItem) => (
              <article key={pageItem._id} className="group">
                <Link href={`/pages/${pageItem.slug}`}>
                  <div className="p-6 bg-white border border-gray-100 rounded-xl hover:shadow-lg hover:border-gray-200 transition-all duration-300">
                    {/* Icon and Title */}
                    <div className="flex items-start gap-4 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 mb-2">
                          {pageItem.title}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(pageItem.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 mb-4">
                      {pageItem.shortDescription || truncateContent(pageItem.content)}
                    </p>

                    {/* Read More */}
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-600 group-hover:gap-3 transition-all">
                      Read more
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center mt-16">
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
