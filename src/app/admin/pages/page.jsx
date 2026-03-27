"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Table, TableHeader, TableBody, TableColumn, TableRow, TableCell, User, Pagination, Chip } from "@heroui/react";
import { Trash2, Edit3, FileText, Plus, Eye } from "lucide-react";
import Empty from "@/components/block/Empty";
import DeleteConfirmationModal from "@/components/block/DeleteConfirmationModal";
import formatDate from "@/utils/formatDate";
import { Spinner } from "@heroui/react";
import CustomButton from "@/components/block/CustomButton";

export default function PagesTablePage() {
  const [pages, setPages] = useState([]);
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(10);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedPage, setSelectedPage] = useState(null);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.ceil(pages.length / rowsPerPage);
  const paginatedPages = pages.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    fetchPages();
  }, []);

  const fetchPages = async () => {
    try {
      const res = await fetch("/api/pages");
      const data = await res.json();
      setPages(data);
    } catch (err) {
      console.error("Failed to fetch pages:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPage) return;
    try {
      const res = await fetch("/api/pages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: selectedPage }),
      });
      if (res.ok) {
        setPages(pages.filter((p) => p._id !== selectedPage));
      }
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleteModalOpen(false);
      setSelectedPage(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Published": return "success";
      case "Draft": return "warning";
      case "Archived": return "default";
      default: return "default";
    }
  };

  const truncateContent = (content, maxLength = 80) => {
    if (!content) return "No content";
    const textContent = content.replace(/<[^>]+>/g, "");
    return textContent.length > maxLength ? textContent.slice(0, maxLength) + "..." : textContent;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <div className="text-center">
          <Spinner color="secondary" variant="gradient" size="md" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-0 md:p-6 space-y-6">
      {/* Simple Header */}
      <div className="flex flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pages</h1>
          <p className="text-gray-600 text-sm mt-1">
            {pages.length} {pages.length === 1 ? "page" : "pages"} in your website
          </p>
        </div>
        <CustomButton 
          as={Link} 
          href="/admin/pages/new"
          intent="primary"
          size="sm"
          startContent={<Plus className="w-4 h-4" />}
          tooltip="Create a new page"
        >
          Add Page
        </CustomButton>
      </div>

      {/* Pages Content */}
      <div className="bg-white rounded-xl overflow-hidden">
        {pages.length === 0 ? (
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No pages yet</h3>
            <p className="text-gray-600 mb-4 text-sm">Get started by creating your first page.</p>
            <CustomButton
              as={Link}
              href="/admin/pages/new"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create First Page
            </CustomButton>
          </div>
        ) : (
          <div className="overflow-hidden">
            {/* Mobile Cards View */}
            <div className="block lg:hidden">
              <div className="p-4">
                <div className="space-y-3">
                  {paginatedPages.map((pageItem) => (
                    <div key={pageItem._id} className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-start space-x-3">
                        <img 
                          src={pageItem.images?.[0] || "/placeholder-page.png"} 
                          alt={pageItem.title} 
                          className="w-12 h-12 rounded-lg object-cover bg-gray-200" 
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-gray-900 text-sm truncate">{pageItem.title}</h4>
                            <Chip size="sm" color={getStatusColor(pageItem.status)} variant="flat">
                              {pageItem.status}
                            </Chip>
                          </div>
                          <p className="text-gray-600 text-xs mb-2 line-clamp-2">
                            {pageItem.shortDescription || truncateContent(pageItem.content)}
                          </p>
                          <p className="text-xs text-gray-500">{formatDate(pageItem.createdAt)}</p>
                        </div>
                        <div className="flex gap-2">
                          {pageItem.status === "Published" && (
                            <Link href={`/pages/${pageItem.slug}`} target="_blank">
                              <button className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors">
                                <Eye className="w-4 h-4" />
                              </button>
                            </Link>
                          )}
                          <button
                            className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                            onClick={() => {
                              setSelectedPage(pageItem._id);
                              setDeleteModalOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <Link
                            href={{
                              pathname: "/admin/pages/new",
                              query: { pageId: pageItem._id, isUpdate: true },
                            }}
                          >
                            <button className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block">
              <Table
                shadow="none"
                aria-label="Pages Table"
                classNames={{
                  wrapper: "shadow-none border-none rounded-none",
                  th: "bg-gray-50 text-gray-700 font-medium py-3",
                  td: "py-3 ",
                }}
                bottomContent={
                  pages.length > rowsPerPage ? (
                    <div className="w-full flex justify-center p-4 border-t border-gray-200">
                      <Pagination isCompact showControls color="primary" page={page} total={totalPages} onChange={(page) => setPage(page)} />
                    </div>
                  ) : null
                }
              >
                <TableHeader>
                  <TableColumn>Page</TableColumn>
                  <TableColumn className="hidden md:table-cell">Status</TableColumn>
                  <TableColumn className="hidden md:table-cell">Date</TableColumn>
                  <TableColumn className="hidden xl:table-cell">Last Update</TableColumn>
                  <TableColumn className="text-center">Actions</TableColumn>
                </TableHeader>
                <TableBody>
                  {paginatedPages.map((pageItem) => (
                    <TableRow key={pageItem._id} className="hover:bg-gray-50">
                      <TableCell>
                        <User
                          avatarProps={{
                            src: pageItem.images?.[0] || "/placeholder-page.png",
                            name: pageItem.title,
                            size: "md",
                            className: "rounded-lg",
                          }}
                          name={<span className="font-medium text-gray-900">{pageItem.title}</span>}
                          description={
                            <span className="text-gray-600 text-sm line-clamp-1 md:line-clamp-2">
                              {pageItem.shortDescription || truncateContent(pageItem.content)}
                            </span>
                          }
                        />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Chip size="sm" color={getStatusColor(pageItem.status)} variant="flat">
                          {pageItem.status}
                        </Chip>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-gray-600 text-sm">{formatDate(pageItem.createdAt)}</TableCell>
                      <TableCell className="hidden xl:table-cell text-gray-600 text-sm">{formatDate(pageItem.updatedAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-2">
                          {pageItem.status === "Published" && (
                            <Link href={`/pages/${pageItem.slug}`} target="_blank">
                              <button
                                className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                                title="View Page"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </Link>
                          )}
                          <button
                            className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                            onClick={() => {
                              setSelectedPage(pageItem._id);
                              setDeleteModalOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <Link
                            href={{
                              pathname: "/admin/pages/new",
                              query: { pageId: pageItem._id, isUpdate: true },
                            }}
                          >
                            <button className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Pagination */}
            {pages.length > rowsPerPage && (
              <div className="block lg:hidden p-4 border-t border-gray-200">
                <Pagination isCompact showControls color="primary" page={page} total={totalPages} onChange={(page) => setPage(page)} className="flex justify-center" />
              </div>
            )}
          </div>
        )}
      </div>

      <DeleteConfirmationModal 
        isOpen={deleteModalOpen} 
        onClose={() => setDeleteModalOpen(false)} 
        onConfirm={handleDelete} 
        title="Delete Page"
        message="Are you sure you want to delete this page? This action cannot be undone."
      />
    </div>
  );
}