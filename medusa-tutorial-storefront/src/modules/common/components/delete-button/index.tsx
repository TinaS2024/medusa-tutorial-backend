import { deleteLineItem } from "@lib/data/cart";
import { Spinner, Trash } from "@medusajs/icons";
import { clx } from "@medusajs/ui";
import { useState } from "react";
import { removeBundleFromCart } from "@lib/data/cart";

const DeleteButton = ({
  id,
  children,
  className,
  bundle_id,
}: {
  id: string
  children?: React.ReactNode
  className?: string
  bundle_id?: string
}) => {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    if(bundle_id)
    {
    await removeBundleFromCart(bundle_id).catch((err)=>{
      setIsDeleting(false);
    })
  }else{
    await deleteLineItem(id).catch((err) => {
    setIsDeleting(false);
    })
    }
  }

  return (
    <div
      className={clx(
        "flex items-center justify-between text-small-regular",
        className
      )}
    >
      <button
        className="flex gap-x-1 text-ui-fg-subtle hover:text-ui-fg-base cursor-pointer"
        onClick={() => handleDelete(id)}
      >
        {isDeleting ? <Spinner className="animate-spin" /> : <Trash />}
        <span>{children}</span>
      </button>
    </div>
  )
}

export default DeleteButton
