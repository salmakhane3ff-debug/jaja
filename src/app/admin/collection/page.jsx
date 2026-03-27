"use client";
import React, { useEffect, useState, useMemo } from "react";
import { Input, Spinner, Pagination, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, User } from "@heroui/react";
import { MdDelete } from "react-icons/md";
import { RiEditCircleFill } from "react-icons/ri";
import SingleImageSelect from "@/components/block/ImageSelector";
import DeleteConfirmationModal from "@/components/block/DeleteConfirmationModal";
import Empty from "@/components/block/Empty";
import CustomButton from "@/components/block/CustomButton";

export default function Page() {
  // ── Collection state ────────────────────────────────────────────────────────
  const [collection,           setCollection]           = useState([]);
  const [title,                setTitle]                = useState("");
  const [description,          setDescription]          = useState("");
  const [loading,              setLoading]              = useState(false);
  const [isModalOpen,          setModalOpen]            = useState(false);
  const [isBannerModalOpen,    setBannerModalOpen]      = useState(false);
  const [featuredImage,        setFeaturedImage]        = useState("");
  const [collectionBanner,     setCollectionBanner]     = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState(null);
  const [deleteModalOpen,      setDeleteModalOpen]      = useState(false);
  const [isFetching,           setIsFetching]           = useState(true);
  const [titleError,           setTitleError]           = useState(false);
  const [page,                 setPage]                 = useState(1);
  const rowsPerPage = 8;

  const [sectionTitle,       setSectionTitle]       = useState("Explore Our Collections");
  const [sectionDescription, setSectionDescription] = useState("Discover a wide range of collections tailored to your interests");
  const [sectionLoading,     setSectionLoading]     = useState(false);
  const [sectionId,          setSectionId]          = useState(null);


  // ── Collection fetch ────────────────────────────────────────────────────────
  const fetchCollection = async () => {
    setIsFetching(true);
    try {
      const res  = await fetch("/api/collection", { cache: "reload" });
      const data = await res.json();
      if (res.ok) setCollection(data);
    } catch (err) { console.error("Fetch collections failed:", err); }
    finally { setIsFetching(false); }
  };

  const fetchSectionSettings = async () => {
    try {
      const res  = await fetch("/api/data?collection=collection-section", { cache: "reload" });
      const data = await res.json();
      if (res.ok && data.length > 0) {
        const settings = data[data.length - 1];
        setSectionId(settings._id);
        setSectionTitle(settings.data?.title || "Explore Our Collections");
        setSectionDescription(settings.data?.description || "Discover a wide range of collections tailored to your interests");
      }
    } catch (err) { console.error("Fetch section settings failed:", err); }
  };

  useEffect(() => {
    fetchCollection();
    fetchSectionSettings();
  }, []);

  // ── Collection CRUD ─────────────────────────────────────────────────────────
  const createCollection = async () => {
    setLoading(true);
    if (!title) { setTitleError(true); setLoading(false); return; }
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, image: featuredImage, banner: collectionBanner }),
      });
      const data = await res.json();
      if (res.ok) {
        setTitle(""); setDescription(""); setFeaturedImage(""); setCollectionBanner("");
        fetchCollection();
      } else { console.error("Failed to create collection:", data); }
    } catch (err) { console.error("Error creating collection:", err); }
    finally { setLoading(false); }
  };

  const updateCollection = async () => {
    if (!selectedCollectionId || !title) { setTitleError(!title); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/collection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: selectedCollectionId, title, description, image: featuredImage, banner: collectionBanner }),
      });
      const data = await res.json();
      if (res.ok) {
        setTitle(""); setDescription(""); setFeaturedImage(""); setCollectionBanner("");
        setSelectedCollectionId(null);
        fetchCollection();
      } else { console.error("Failed to update collection:", data); }
    } catch (err) { console.error("Error updating collection:", err); }
    finally { setLoading(false); }
  };

  const updateSectionSettings = async () => {
    setSectionLoading(true);
    try {
      if (sectionId) {
        const res = await fetch("/api/data", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ _id: sectionId, collection: "collection-section", data: { _id: "collection-section", title: sectionTitle, description: sectionDescription } }),
        });
        if (res.ok) window.dispatchEvent(new Event("sectionSettingsUpdated"));
      } else {
        const res = await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection: "collection-section", data: { _id: "collection-section", title: sectionTitle, description: sectionDescription } }),
        });
        if (res.ok) { const d = await res.json(); setSectionId(d._id); window.dispatchEvent(new Event("sectionSettingsUpdated")); }
      }
    } catch (err) { console.error("Error updating section settings:", err); }
    finally { setSectionLoading(false); }
  };

  const deleteCollection = async () => {
    if (!selectedCollectionId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/collection", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: selectedCollectionId }),
      });
      if (res.ok) { fetchCollection(); setDeleteModalOpen(false); setSelectedCollectionId(null); }
    } catch (err) { console.error("Error deleting collection:", err); }
    finally { setLoading(false); }
  };

  // ── Pagination ──────────────────────────────────────────────────────────────
  const pages = Math.ceil(collection.length / rowsPerPage);
  const currentCollection = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return collection.slice(start, start + rowsPerPage);
  }, [page, collection]);

  if (isFetching) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-80px)]">
        <Spinner color="secondary" variant="gradient" size="md" />
      </div>
    );
  }

  return (
    <div className="px-5 py-3">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Collections</h1>
        <p className="text-sm text-gray-600">Manage your store collections.</p>
      </div>

      <>
          {/* Section Settings */}
          <div className="bg-white p-4 rounded-lg mb-6">
            <h2 className="text-lg font-semibold mb-3">Collection Section Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input placeholder="Enter section title" value={sectionTitle} size="sm" label="Section Title" labelPlacement="outside"
                description="Main heading of the collection section." onChange={(e) => setSectionTitle(e.target.value)} />
              <Input placeholder="Enter section description" value={sectionDescription} size="sm" label="Section Description" labelPlacement="outside"
                description="Subtitle under the main heading." onChange={(e) => setSectionDescription(e.target.value)} />
            </div>
            <div className="mt-4">
              <CustomButton size="sm" className="bg-blue-600 text-white" onPress={updateSectionSettings} isLoading={sectionLoading}>
                {sectionLoading ? "Updating..." : "Update Section Settings"}
              </CustomButton>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            {/* Collection Form */}
            <div className="w-full md:w-1/3 bg-white p-4 rounded-lg h-min">
              <h2 className="text-lg font-semibold mb-3">{selectedCollectionId ? "Edit Collection" : "Add New Collection"}</h2>
              <div className="flex flex-col gap-4">
                <Input placeholder="Enter collection title" value={title} size="sm" label="Collection Title" isrequired labelPlacement="outside"
                  description="Title of your collection."
                  onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(false); }}
                  isInvalid={titleError} errorMessage={titleError ? "Title is required" : ""} />
                <Input placeholder="Enter collection description" size="sm" value={description} label="Collection Description"
                  labelPlacement="outside" description="Provide a description." onChange={(e) => setDescription(e.target.value)} />
                {/* Collection thumbnail */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">Miniature</p>
                  <div onClick={() => setModalOpen(true)}
                    className={`flex justify-center items-center border-2 border-dashed rounded-md cursor-pointer ${!featuredImage ? "h-[140px]" : ""}`}
                    style={{ backgroundColor: featuredImage ? "transparent" : "#f9f9f9" }}>
                    {featuredImage
                      ? <img src={featuredImage} alt="Featured" className="w-full h-[140px] object-cover rounded-md" />
                      : <span className="text-gray-400 text-sm">Cliquer pour choisir</span>}
                  </div>
                </div>

                {/* Collection banner (optional) */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">
                    Bannière <span className="font-normal text-gray-400">(optionnel)</span>
                  </p>
                  <div onClick={() => setBannerModalOpen(true)}
                    className={`flex justify-center items-center border-2 border-dashed rounded-md cursor-pointer ${!collectionBanner ? "h-[100px]" : ""}`}
                    style={{ backgroundColor: collectionBanner ? "transparent" : "#f9f9f9" }}>
                    {collectionBanner
                      ? (
                        <div className="relative w-full group">
                          <img src={collectionBanner} alt="Banner" className="w-full h-[100px] object-cover rounded-md" />
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setCollectionBanner(""); }}
                            className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >×</button>
                        </div>
                      )
                      : <span className="text-gray-400 text-sm">Cliquer pour ajouter une bannière</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">S'affiche en haut de la page collection.</p>
                </div>

<CustomButton size="sm" className="bg-black text-white" onPress={selectedCollectionId ? updateCollection : createCollection} isLoading={loading}>
                  {loading ? (selectedCollectionId ? "Updating..." : "Creating...") : selectedCollectionId ? "Update" : "Create"}
                </CustomButton>
                {selectedCollectionId && (
                  <button type="button" onClick={() => { setSelectedCollectionId(null); setTitle(""); setDescription(""); setFeaturedImage(""); setCollectionBanner(""); }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline text-center">
                    Cancel edit
                  </button>
                )}
              </div>
            </div>

            <SingleImageSelect isOpen={isModalOpen} onClose={() => setModalOpen(false)} onSelectImages={(urls) => setFeaturedImage(urls)} selectType="single" />
            <SingleImageSelect isOpen={isBannerModalOpen} onClose={() => setBannerModalOpen(false)} onSelectImages={(urls) => setCollectionBanner(urls)} selectType="single" />

            {/* Collection Table */}
            <div className="w-full md:w-2/3">
              <h2 className="text-lg font-semibold mb-3">Collection List</h2>
              {collection.length === 0 ? (
                <Empty title="No Collections Found" description="Please create a new collection to get started." />
              ) : (
                <Table shadow="none" aria-label="Collection Table">
                  <TableHeader>
                    <TableColumn>Collection</TableColumn>
                    <TableColumn>Homepage</TableColumn>
                    <TableColumn>Created At</TableColumn>
                    <TableColumn>Actions</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {currentCollection.map((item) => (
                      <TableRow key={item._id}>
                        <TableCell>
                          <User avatarProps={{ src: item.image || undefined, name: item.title }} name={item.title} description={item.description || "No description"} />
                        </TableCell>
                        <TableCell>
                          {item.showOnHomepage ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full w-fit">
                                ✓ On · #{item.homepageOrder}
                              </span>
                              <span className="text-xs text-gray-400">{item.homepageProductLimit} products</span>
                            </div>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </TableCell>
                        <TableCell>
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="p-2 bg-blue-100 hover:bg-blue-200 rounded-md cursor-pointer"
                              onClick={() => { setTitle(item.title); setDescription(item.description); setFeaturedImage(item.image); setCollectionBanner(item.banner || ""); setSelectedCollectionId(item._id); setShowOnHomepage(item.showOnHomepage ?? false); setHomepageOrder(item.homepageOrder ?? 0); setHomepageProductLimit(item.homepageProductLimit ?? 4); }}>
                              <RiEditCircleFill className="text-blue-500 text-lg" />
                            </span>
                            <span className="p-2 bg-red-100 hover:bg-red-200 rounded-md cursor-pointer"
                              onClick={() => { setTitle(""); setDescription(""); setFeaturedImage(""); setSelectedCollectionId(item._id); setDeleteModalOpen(true); }}>
                              <MdDelete className="text-red-600 text-lg" />
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {collection.length > rowsPerPage && (
                <div className="flex justify-center mt-4">
                  <Pagination isCompact showControls showShadow color="secondary" page={page} total={pages} onChange={setPage} />
                </div>
              )}
            </div>
          </div>

          <DeleteConfirmationModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={deleteCollection} />
        </>
    </div>
  );
}
