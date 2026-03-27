"use client";

import React, { useEffect, useState } from "react";
import { Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Pagination, Tooltip } from "@heroui/react";
import { Copy, Mail, Users, Calendar } from "lucide-react";
import Empty from "@/components/block/Empty";
import CustomButton from "@/components/block/CustomButton";
import formatDate from "@/utils/formatDate";

const COLLECTION = "news-latter";

export default function NewsLatterPage() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState(null);
  const rowsPerPage = 8;

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/data?collection=${COLLECTION}`);
      const data = await res.json();
      if (res.ok) {
        const sorted = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setEmails(sorted);
      }
    } catch (err) {
      console.error("Failed to fetch emails", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const handleCopy = async (email, id) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const totalPages = Math.ceil(emails.length / rowsPerPage);
  const currentPageData = emails.slice((page - 1) * rowsPerPage, page * rowsPerPage);

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
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Newsletter Subscribers</h1>
          <p className="text-gray-600 text-sm mt-1">
            {emails.length} {emails.length === 1 ? 'subscriber' : 'subscribers'} to your newsletter
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-blue-700">{emails.length} Total</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl overflow-hidden">
        {emails.length === 0 ? (
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <Mail className="w-8 h-8 text-gray-400" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No subscribers yet</h3>
            <p className="text-gray-600 text-sm">
              Once users subscribe to your newsletter, their emails will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            {/* Mobile Cards View */}
            <div className="block lg:hidden">
              <div className="p-4">
                <div className="space-y-3">
                  {currentPageData.map((item) => (
                    <div key={item._id} className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Mail className="w-4 h-4 text-gray-500" />
                            <span className="font-medium text-gray-900 text-sm truncate">{item.data}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            <span>{formatDate(item.createdAt)}</span>
                          </div>
                        </div>
                        <Tooltip content={copiedId === item._id ? "Copied!" : "Copy email"} placement="top">
                          <button
                            onClick={() => handleCopy(item.data, item._id)}
                            className={`p-2 rounded-lg hover:bg-gray-200 transition-colors ${
                              copiedId === item._id ? "bg-green-100 text-green-600" : "text-gray-600"
                            }`}
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </Tooltip>
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
                aria-label="Newsletter Subscribers Table"
                classNames={{
                  wrapper: "shadow-none border-none rounded-none",
                  th: "bg-gray-50 text-gray-700 font-medium py-3",
                  td: "py-3"
                }}
                bottomContent={
                  emails.length > rowsPerPage ? (
                    <div className="w-full flex justify-center p-4 border-t border-gray-200">
                      <Pagination 
                        isCompact 
                        showControls 
                        color="primary" 
                        page={page} 
                        total={totalPages} 
                        onChange={setPage} 
                      />
                    </div>
                  ) : null
                }
              >
                <TableHeader>
                  <TableColumn>Email Address</TableColumn>
                  <TableColumn className="hidden md:table-cell">Subscribed Date</TableColumn>
                  <TableColumn className="text-center w-24">Actions</TableColumn>
                </TableHeader>
                <TableBody>
                  {currentPageData.map((item) => (
                    <TableRow key={item._id} className="hover:bg-gray-50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 rounded-lg">
                            <Mail className="w-4 h-4 text-blue-600" />
                          </div>
                          <span className="font-medium text-gray-900">{item.data}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-gray-600 text-sm">
                        {formatDate(item.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          <Tooltip content={copiedId === item._id ? "Copied!" : "Copy email"} placement="top">
                            <button
                              onClick={() => handleCopy(item.data, item._id)}
                              className={`p-2 rounded-lg hover:bg-gray-100 transition-colors ${
                                copiedId === item._id ? "bg-green-100 text-green-600" : "text-gray-600"
                              }`}
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Pagination */}
            {emails.length > rowsPerPage && (
              <div className="block lg:hidden p-4 border-t border-gray-200">
                <Pagination 
                  isCompact 
                  showControls 
                  color="primary" 
                  page={page} 
                  total={totalPages} 
                  onChange={setPage}
                  className="flex justify-center"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
