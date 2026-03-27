import { useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import CustomButton from "./CustomButton";

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, title, description }) => {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} backdrop="blur" onOpenChange={onClose}>
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader className="flex flex-col gap-1">{title || "Confirm Deletion"}</ModalHeader>
            <ModalBody>
              <p>{description || "Are you sure you want to delete this item? This action is permanent and cannot be undone."}</p>
            </ModalBody>
            <ModalFooter>
              <CustomButton 
                intent="secondary" 
                size="sm" 
                onPress={close}
                tooltip="Cancel and keep the item"
              >
                Cancel
              </CustomButton>
              <CustomButton 
                intent="danger" 
                size="sm"
                isLoading={loading} 
                onPress={handleConfirm} 
                disabled={loading}
                tooltip="Permanently delete this item"
              >
                Delete Permanently
              </CustomButton>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default DeleteConfirmationModal;
